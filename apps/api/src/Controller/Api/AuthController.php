<?php

declare(strict_types=1);

namespace App\Controller\Api;

use App\Auth\GoogleOAuth;
use App\Auth\HandlePolicy;
use App\Auth\SessionManager;
use App\Dto\AuthorizationUrl;
use App\Dto\DevLoginInput;
use App\Dto\OAuthCallbackInput;
use App\Dto\SessionIssued;
use App\Dto\ValidationError;
use App\Entity\User;
use App\Exception\InvalidInputException;
use App\Http\CacheHeaders;
use App\Repository\UserRepository;
use Doctrine\ORM\EntityManagerInterface;
use Nelmio\ApiDocBundle\Attribute\Model;
use OpenApi\Attributes as OA;
use Psr\Log\LoggerInterface;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Attribute\MapRequestPayload;
use Symfony\Component\Routing\Attribute\Route;

/**
 * ログイン。登録は Google OAuth のみ（パスワードは持たない）。
 *
 * 流れ: Worker の /auth/google → authorize で同意画面の URL と state をもらい、
 * state を Cookie に控えて Google へ → Google が Worker の /auth/callback に戻す →
 * Worker が state を照合して callback に code を渡す → セッショントークンを受け取って Cookie に入れる。
 */
#[OA\Tag(name: 'auth')]
#[Route('/api/auth')]
final class AuthController extends ApiController
{
    public function __construct(
        private readonly GoogleOAuth $google,
        private readonly SessionManager $sessions,
        private readonly UserRepository $users,
        private readonly EntityManagerInterface $em,
        private readonly LoggerInterface $logger,
    ) {
    }

    #[Route('/google/authorize', name: 'api_auth_google_authorize', methods: ['GET'])]
    #[OA\Response(response: 200, description: '同意画面の URL', content: new OA\JsonContent(ref: new Model(type: AuthorizationUrl::class)))]
    #[OA\Response(response: 503, description: 'Google OAuth が未設定', content: new OA\JsonContent(ref: new Model(type: ValidationError::class)))]
    public function authorize(): JsonResponse
    {
        if (!$this->google->isConfigured()) {
            return new JsonResponse(['message' => 'Google ログインが設定されていません。', 'errors' => new \stdClass()], 503);
        }

        ['url' => $url, 'state' => $state] = $this->google->authorizationUrl();

        return CacheHeaders::private($this->json(new AuthorizationUrl($url, $state)));
    }

    #[Route('/google/callback', name: 'api_auth_google_callback', methods: ['POST'])]
    #[OA\RequestBody(content: new OA\JsonContent(ref: new Model(type: OAuthCallbackInput::class)))]
    #[OA\Response(response: 200, description: 'ログイン成功', content: new OA\JsonContent(ref: new Model(type: SessionIssued::class)))]
    #[OA\Response(response: 400, description: '認可コードが無効', content: new OA\JsonContent(ref: new Model(type: ValidationError::class)))]
    #[OA\Response(response: 403, description: 'アカウントが停止されている', content: new OA\JsonContent(ref: new Model(type: ValidationError::class)))]
    public function callback(#[MapRequestPayload] OAuthCallbackInput $input): JsonResponse
    {
        try {
            $google = $this->google->exchange($input->code);
        } catch (\Throwable $e) {
            $this->logger->notice('google oauth exchange failed', ['error' => $e->getMessage()]);

            return new JsonResponse(['message' => 'Google ログインに失敗しました。もう一度お試しください。', 'errors' => new \stdClass()], 400);
        }

        $user = $this->users->findOneByGoogleSub($google['sub']);
        if (null === $user) {
            $user = new User($google['sub'], mb_substr($google['name'], 0, 50));
            $this->em->persist($user);
        }
        // Google 側でアイコンを変えたら追従する（表示名は本人が決めたものを優先して触らない）
        $user->setAvatarUrl($google['avatarUrl']);
        $this->em->flush();

        return $this->issue($user);
    }

    #[Route('/session', name: 'api_auth_session_delete', methods: ['DELETE'])]
    #[OA\Response(response: 204, description: 'ログアウトした（トークンを無効化した）')]
    public function logout(Request $request): JsonResponse
    {
        $header = (string) $request->headers->get('Authorization', '');
        if (str_starts_with($header, 'Bearer ')) {
            $this->sessions->revoke(substr($header, 7));
        }

        return $this->noContent();
    }

    /**
     * 開発用のログイン。Google の設定なしでローカルの動作確認をするためだけに使う。
     * APP_ENV=dev かつ DEV_LOGIN_ENABLED=1 のときしか動かない。
     */
    #[Route('/dev-login', name: 'api_auth_dev_login', methods: ['POST'])]
    #[OA\RequestBody(content: new OA\JsonContent(ref: new Model(type: DevLoginInput::class)))]
    #[OA\Response(response: 200, description: 'ログイン成功', content: new OA\JsonContent(ref: new Model(type: SessionIssued::class)))]
    #[OA\Response(response: 404, description: '開発用ログインが無効')]
    public function devLogin(
        #[MapRequestPayload] DevLoginInput $input,
        #[Autowire('%kernel.environment%')] string $environment,
        #[Autowire(env: 'default::DEV_LOGIN_ENABLED')] ?string $enabled,
    ): JsonResponse {
        if ('dev' !== $environment || '1' !== $enabled) {
            return $this->notFound();
        }

        $handle = HandlePolicy::normalize($input->handle);
        if (1 !== preg_match('/^[a-z0-9_]{3,20}$/', $handle)) {
            throw InvalidInputException::field('handle', 'handle は英小文字・数字・_ の 3〜20 文字です。');
        }

        $user = $this->users->findOneByGoogleSub('dev:'.$handle);
        if (null === $user) {
            $user = (new User('dev:'.$handle, $handle))->setHandle($handle);
            $this->em->persist($user);
            $this->em->flush();
        }

        return $this->issue($user);
    }

    private function issue(User $user): JsonResponse
    {
        if ($user->isDeleted()) {
            return new JsonResponse(['message' => 'このアカウントは退会済みです。', 'errors' => new \stdClass()], 403);
        }
        if ($user->isSuspended()) {
            return new JsonResponse(['message' => 'このアカウントは利用を停止されています。', 'errors' => new \stdClass()], 403);
        }

        ['token' => $token, 'session' => $session] = $this->sessions->issue($user);

        return CacheHeaders::private($this->json(new SessionIssued(
            token: $token,
            expiresAt: $session->getExpiresAt()->format(\DateTimeInterface::ATOM),
            needsHandle: null === $user->getHandle(),
        )));
    }
}
