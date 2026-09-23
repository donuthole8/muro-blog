<?php

declare(strict_types=1);

namespace App\Controller\Api;

use App\Dto\PostPage;
use App\Dto\UserProfile;
use App\Dto\ValidationError;
use App\Http\CacheHeaders;
use App\Http\Cursor;
use App\Repository\FollowRepository;
use App\Repository\PostRepository;
use App\Repository\UserRepository;
use App\Service\TimesMapper;
use Nelmio\ApiDocBundle\Attribute\Model;
use OpenApi\Attributes as OA;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Attribute\MapQueryParameter;
use Symfony\Component\Routing\Attribute\Route;

/** 部屋（1ユーザー1部屋）。 */
#[OA\Tag(name: 'rooms')]
#[Route('/api/users/{handle}', requirements: ['handle' => '[A-Za-z0-9_]{1,32}'])]
final class UserController extends ApiController
{
    public function __construct(
        private readonly UserRepository $users,
        private readonly PostRepository $posts,
        private readonly FollowRepository $follows,
        private readonly TimesMapper $mapper,
    ) {
    }

    #[Route('', name: 'api_users_show', methods: ['GET'])]
    #[OA\Response(response: 200, description: '部屋の持ち主のプロフィール', content: new OA\JsonContent(ref: new Model(type: UserProfile::class)))]
    #[OA\Response(response: 404, description: '部屋が存在しない', content: new OA\JsonContent(ref: new Model(type: ValidationError::class)))]
    public function show(string $handle): JsonResponse
    {
        $user = $this->users->findRoomOwner($handle);
        if (null === $user) {
            return $this->notFound('部屋が見つかりません。');
        }

        return CacheHeaders::public(
            $this->json($this->mapper->toProfile($user, $this->follows->countFollowers($user))),
            CacheHeaders::FRESH,
        );
    }

    #[Route('/posts', name: 'api_users_posts', methods: ['GET'])]
    #[OA\Parameter(name: 'cursor', in: 'query', description: '前のページの nextCursor', schema: new OA\Schema(type: 'string'))]
    #[OA\Response(response: 200, description: '部屋の親投稿を新しい順に', content: new OA\JsonContent(ref: new Model(type: PostPage::class)))]
    #[OA\Response(response: 404, description: '部屋が存在しない', content: new OA\JsonContent(ref: new Model(type: ValidationError::class)))]
    public function posts(string $handle, #[MapQueryParameter] ?string $cursor = null): JsonResponse
    {
        $user = $this->users->findRoomOwner($handle);
        if (null === $user) {
            return $this->notFound('部屋が見つかりません。');
        }

        // 停止中の部屋は投稿を見せない
        $page = $user->isSuspended()
            ? ['items' => [], 'nextCursor' => null]
            : $this->posts->findRoomPage($user, Cursor::parse($cursor), Cursor::PAGE_SIZE);

        return CacheHeaders::public(
            $this->json(new PostPage($this->mapper->toPosts($page['items']), $page['nextCursor'])),
            CacheHeaders::FRESH,
        );
    }
}
