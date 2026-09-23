<?php

declare(strict_types=1);

namespace App\Controller\Api\Admin;

use App\Auth\SessionManager;
use App\Controller\Api\ApiController;
use App\Dto\AdminPost;
use App\Dto\AdminPostPage;
use App\Dto\AdminUser;
use App\Dto\PostDeleted;
use App\Dto\ValidationError;
use App\Enum\ReportResolution;
use App\Http\CacheHeaders;
use App\Http\Cursor;
use App\Repository\PostRepository;
use App\Repository\ReportRepository;
use App\Repository\UserRepository;
use App\Service\TimesMapper;
use App\Service\TimesPostWriter;
use Doctrine\ORM\EntityManagerInterface;
use Nelmio\ApiDocBundle\Attribute\Model;
use Nelmio\ApiDocBundle\Attribute\Security;
use OpenApi\Attributes as OA;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Attribute\MapQueryParameter;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Routing\Requirement\Requirement;
use Symfony\Component\Uid\Ulid;

/**
 * 管理者による投稿の非表示・削除とユーザーの停止。
 *
 * 一般公開サービスで運営者が投稿を消せないと削除依頼（情報流通プラットフォーム対処法など）に
 * 対応できないため、荒らし対策のうちこれだけは公開前に入れる。
 * /api/admin 配下は security.yaml の access_control で ROLE_ADMIN に限定している。
 */
#[OA\Tag(name: 'admin')]
#[Security(name: 'SessionToken')]
#[Route('/api/admin')]
final class ModerationController extends ApiController
{
    public function __construct(
        private readonly PostRepository $posts,
        private readonly UserRepository $users,
        private readonly ReportRepository $reports,
        private readonly TimesPostWriter $writer,
        private readonly TimesMapper $mapper,
        private readonly SessionManager $sessions,
        private readonly EntityManagerInterface $em,
    ) {
    }

    #[Route('/posts', name: 'api_admin_posts_index', methods: ['GET'])]
    #[OA\Parameter(name: 'cursor', in: 'query', schema: new OA\Schema(type: 'string'))]
    #[OA\Parameter(name: 'handle', in: 'query', description: 'この人の投稿に絞る', schema: new OA\Schema(type: 'string'))]
    #[OA\Response(response: 200, description: '削除済み以外の全投稿（非表示を含む）を新しい順に', content: new OA\JsonContent(ref: new Model(type: AdminPostPage::class)))]
    public function posts(#[MapQueryParameter] ?string $cursor = null, #[MapQueryParameter] ?string $handle = null): JsonResponse
    {
        $author = null;
        if (null !== $handle && '' !== $handle) {
            $author = $this->users->findOneByHandle($handle);
            if (null === $author) {
                return CacheHeaders::private($this->json(new AdminPostPage([], null)));
            }
        }

        ['items' => $items, 'nextCursor' => $next] = $this->posts->findForModeration(Cursor::parse($cursor), 50, $author);

        return CacheHeaders::private($this->json(new AdminPostPage(
            array_map($this->mapper->toAdminPost(...), $items),
            $next,
        )));
    }

    #[Route('/posts/{id}/hide', name: 'api_admin_posts_hide', requirements: ['id' => Requirement::ULID], methods: ['POST'])]
    #[OA\Response(response: 200, description: '非表示にした', content: new OA\JsonContent(ref: new Model(type: AdminPost::class)))]
    public function hide(string $id): JsonResponse
    {
        return $this->toggleHidden($id, true);
    }

    #[Route('/posts/{id}/unhide', name: 'api_admin_posts_unhide', requirements: ['id' => Requirement::ULID], methods: ['POST'])]
    #[OA\Response(response: 200, description: '非表示を解除した', content: new OA\JsonContent(ref: new Model(type: AdminPost::class)))]
    public function unhide(string $id): JsonResponse
    {
        return $this->toggleHidden($id, false);
    }

    #[Route('/posts/{id}', name: 'api_admin_posts_delete', requirements: ['id' => Requirement::ULID], methods: ['DELETE'])]
    #[OA\Response(response: 200, description: '削除した', content: new OA\JsonContent(ref: new Model(type: PostDeleted::class)))]
    #[OA\Response(response: 404, description: '投稿が存在しない', content: new OA\JsonContent(ref: new Model(type: ValidationError::class)))]
    public function delete(string $id): JsonResponse
    {
        $post = $this->posts->findOneById(Ulid::fromString($id));
        if (null === $post) {
            return $this->notFound('投稿が見つかりません。');
        }

        $imageKey = $this->writer->delete($post);
        $this->reports->resolveAllForPost($post, ReportResolution::Actioned);

        return CacheHeaders::private($this->json(new PostDeleted($imageKey)));
    }

    #[Route('/users', name: 'api_admin_users_index', methods: ['GET'])]
    #[OA\Parameter(name: 'q', in: 'query', description: 'handle か表示名の部分一致', schema: new OA\Schema(type: 'string'))]
    #[OA\Response(response: 200, description: 'ユーザー一覧（新しい順に50件）', content: new OA\JsonContent(type: 'array', items: new OA\Items(ref: new Model(type: AdminUser::class))))]
    public function users(#[MapQueryParameter] ?string $q = null): JsonResponse
    {
        return CacheHeaders::private($this->json(array_map(
            $this->mapper->toAdminUser(...),
            $this->users->searchForAdmin($q, 50),
        )));
    }

    #[Route('/users/{id}/suspend', name: 'api_admin_users_suspend', requirements: ['id' => Requirement::ULID], methods: ['POST'])]
    #[OA\Response(response: 200, description: '停止した。全端末からログアウトさせる', content: new OA\JsonContent(ref: new Model(type: AdminUser::class)))]
    #[OA\Response(response: 422, description: '管理者は停止できない', content: new OA\JsonContent(ref: new Model(type: ValidationError::class)))]
    public function suspend(string $id): JsonResponse
    {
        $user = $this->users->findOneByUlid(Ulid::fromString($id));
        if (null === $user) {
            return $this->notFound('ユーザーが見つかりません。');
        }
        if ($user->isAdmin()) {
            return new JsonResponse(['message' => '管理者は停止できません。先に管理者権限を外してください。', 'errors' => new \stdClass()], 422);
        }

        $user->suspend();
        $this->sessions->revokeAll($user);
        $this->em->flush();

        return CacheHeaders::private($this->json($this->mapper->toAdminUser($user)));
    }

    #[Route('/users/{id}/unsuspend', name: 'api_admin_users_unsuspend', requirements: ['id' => Requirement::ULID], methods: ['POST'])]
    #[OA\Response(response: 200, description: '停止を解除した', content: new OA\JsonContent(ref: new Model(type: AdminUser::class)))]
    public function unsuspend(string $id): JsonResponse
    {
        $user = $this->users->findOneByUlid(Ulid::fromString($id));
        if (null === $user) {
            return $this->notFound('ユーザーが見つかりません。');
        }

        $user->unsuspend();
        $this->em->flush();

        return CacheHeaders::private($this->json($this->mapper->toAdminUser($user)));
    }

    private function toggleHidden(string $id, bool $hidden): JsonResponse
    {
        $post = $this->posts->findOneById(Ulid::fromString($id));
        if (null === $post || $post->isDeleted()) {
            return $this->notFound('投稿が見つかりません。');
        }

        $hidden ? $post->hide() : $post->unhide();
        $this->em->flush();
        if ($hidden) {
            $this->reports->resolveAllForPost($post, ReportResolution::Actioned);
        }

        return CacheHeaders::private($this->json($this->mapper->toAdminPost($post)));
    }
}
