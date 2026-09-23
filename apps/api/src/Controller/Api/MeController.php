<?php

declare(strict_types=1);

namespace App\Controller\Api;

use App\Auth\HandlePolicy;
use App\Dto\AccountDeleted;
use App\Dto\Me;
use App\Dto\MeUpdateInput;
use App\Dto\UploadTicket;
use App\Dto\ValidationError;
use App\Dto\ViewerReactions;
use App\Dto\ViewerState;
use App\Enum\RateLimitedAction;
use App\Exception\InvalidInputException;
use App\Http\CacheHeaders;
use App\Repository\BlockRepository;
use App\Repository\FollowRepository;
use App\Repository\NotificationRepository;
use App\Repository\ReactionRepository;
use App\Repository\UserRepository;
use App\Service\AccountDeleter;
use App\Service\ActionRateLimiter;
use App\Service\CompanyNormalizer;
use App\Service\TimesMapper;
use Doctrine\ORM\EntityManagerInterface;
use Nelmio\ApiDocBundle\Attribute\Model;
use Nelmio\ApiDocBundle\Attribute\Security;
use OpenApi\Attributes as OA;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Attribute\MapQueryParameter;
use Symfony\Component\HttpKernel\Attribute\MapRequestPayload;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;
use Symfony\Component\Uid\Ulid;

/** ログイン中の本人。応答はすべて人ごとに違うのでキャッシュさせない。 */
#[OA\Tag(name: 'me')]
#[Security(name: 'SessionToken')]
#[IsGranted('ROLE_USER')]
#[Route('/api/me')]
final class MeController extends ApiController
{
    public function __construct(
        private readonly UserRepository $users,
        private readonly NotificationRepository $notifications,
        private readonly ReactionRepository $reactions,
        private readonly FollowRepository $follows,
        private readonly TimesMapper $mapper,
        private readonly CompanyNormalizer $companies,
        private readonly AccountDeleter $deleter,
        private readonly BlockRepository $blocks,
        private readonly ActionRateLimiter $rateLimiter,
        private readonly EntityManagerInterface $em,
    ) {
    }

    #[Route('', name: 'api_me_show', methods: ['GET'])]
    #[OA\Response(response: 200, description: '本人の情報と未読通知数', content: new OA\JsonContent(ref: new Model(type: Me::class)))]
    #[OA\Response(response: 401, description: '未ログイン', content: new OA\JsonContent(ref: new Model(type: ValidationError::class)))]
    public function show(): JsonResponse
    {
        return $this->me();
    }

    #[Route('', name: 'api_me_update', methods: ['PUT'])]
    #[OA\RequestBody(content: new OA\JsonContent(ref: new Model(type: MeUpdateInput::class)))]
    #[OA\Response(response: 200, description: '更新後の本人の情報', content: new OA\JsonContent(ref: new Model(type: Me::class)))]
    #[OA\Response(response: 409, description: 'handle が既に使われている', content: new OA\JsonContent(ref: new Model(type: ValidationError::class)))]
    #[OA\Response(response: 422, description: '入力値が不正', content: new OA\JsonContent(ref: new Model(type: ValidationError::class)))]
    public function update(#[MapRequestPayload] MeUpdateInput $input): JsonResponse
    {
        $user = $this->currentUser();

        if (null === $user->getHandle()) {
            $handle = HandlePolicy::normalize((string) $input->handle);
            $violation = HandlePolicy::violation($handle);
            if (null !== $violation) {
                throw InvalidInputException::field('handle', $violation);
            }
            if (null !== $this->users->findOneByHandle($handle)) {
                return $this->json([
                    'message' => 'この handle は既に使われています。',
                    'errors' => ['handle' => 'この handle は既に使われています。'],
                ], 409);
            }
            $user->setHandle($handle);
        } elseif (null !== $input->handle && HandlePolicy::normalize($input->handle) !== $user->getHandle()) {
            throw InvalidInputException::field('handle', 'handle は後から変更できません。');
        }

        $company = trim((string) $input->companyName);
        $user->setDisplayName(trim($input->displayName))
            ->setBio('' === trim((string) $input->bio) ? null : trim((string) $input->bio))
            ->setCompany('' === $company ? null : $company, '' === $company ? null : $this->companies->slugify($company));

        $this->em->flush();

        return $this->me();
    }

    #[Route('', name: 'api_me_delete', methods: ['DELETE'])]
    #[OA\Response(response: 200, description: '退会した。投稿の本文・画像・リアクション・フォロー・通知を削除し、ログアウトさせる', content: new OA\JsonContent(ref: new Model(type: AccountDeleted::class)))]
    public function delete(): JsonResponse
    {
        $imageKeys = $this->deleter->delete($this->currentUser());

        return CacheHeaders::private($this->json(new AccountDeleted($imageKeys)));
    }

    /**
     * 画像アップロードの枠を1つ使う。R2 には API から触れないので、Worker は
     * これが 200 を返したときだけ R2 に置く（連続アップロードで無料枠を削らせないため）。
     */
    #[Route('/uploads', name: 'api_me_uploads', methods: ['POST'])]
    #[OA\Response(response: 200, description: 'アップロードしてよい', content: new OA\JsonContent(ref: new Model(type: UploadTicket::class)))]
    #[OA\Response(response: 429, description: '回数の上限に達した（Retry-After ヘッダー付き）', content: new OA\JsonContent(ref: new Model(type: ValidationError::class)))]
    public function upload(): JsonResponse
    {
        $user = $this->activeUser();
        $this->rateLimiter->consume(RateLimitedAction::ImageUpload, $user);

        return CacheHeaders::private($this->json(new UploadTicket((string) $user->getId())));
    }

    #[Route('/viewer-state', name: 'api_me_viewer_state', methods: ['GET'])]
    #[OA\Parameter(name: 'postIds', in: 'query', description: 'カンマ区切りの投稿 ID（100件まで）', schema: new OA\Schema(type: 'string'))]
    #[OA\Parameter(name: 'handle', in: 'query', description: '指定すると、その人をフォロー・ブロックしているかも返す', schema: new OA\Schema(type: 'string'))]
    #[OA\Response(response: 200, description: '閲覧者ごとの情報', content: new OA\JsonContent(ref: new Model(type: ViewerState::class)))]
    public function viewerState(
        #[MapQueryParameter] ?string $postIds = null,
        #[MapQueryParameter] ?string $handle = null,
    ): JsonResponse {
        $user = $this->currentUser();

        $ids = [];
        foreach (array_slice(array_filter(explode(',', (string) $postIds)), 0, 100) as $id) {
            if (Ulid::isValid($id)) {
                $ids[Ulid::fromString($id)->toRfc4122()] = $id;
            }
        }

        $mine = $this->reactions->findEmojisByUser($user, array_keys($ids));
        $reactions = [];
        foreach ($mine as $rfc => $emojis) {
            $reactions[] = new ViewerReactions($ids[$rfc], $emojis);
        }

        $isFollowing = null;
        $isBlocking = null;
        if (null !== $handle && '' !== $handle) {
            $owner = $this->users->findOneByHandle($handle);
            $isFollowing = null !== $owner && null !== $this->follows->findPair($user, $owner);
            $isBlocking = null !== $owner && $this->blocks->isBlocking($user, $owner);
        }

        return CacheHeaders::private($this->json(new ViewerState(
            $reactions,
            $isFollowing,
            $this->blocks->findBlockedHandles($user),
            $isBlocking,
        )));
    }

    private function me(): JsonResponse
    {
        $user = $this->currentUser();

        return CacheHeaders::private($this->json($this->mapper->toMe($user, $this->notifications->countUnread($user))));
    }
}
