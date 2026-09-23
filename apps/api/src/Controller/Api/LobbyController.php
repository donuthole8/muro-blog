<?php

declare(strict_types=1);

namespace App\Controller\Api;

use App\Dto\PostPage;
use App\Dto\RoomSummary;
use App\Http\CacheHeaders;
use App\Http\Cursor;
use App\Repository\PostRepository;
use App\Repository\UserRepository;
use App\Service\TimesMapper;
use Nelmio\ApiDocBundle\Attribute\Model;
use OpenApi\Attributes as OA;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Attribute\MapQueryParameter;
use Symfony\Component\Routing\Attribute\Route;

/** 部屋を見つけてもらう入口: 新着ロビーと人気の部屋。 */
#[OA\Tag(name: 'discover')]
final class LobbyController extends ApiController
{
    private const POPULAR_LIMIT = 10;

    public function __construct(
        private readonly PostRepository $posts,
        private readonly UserRepository $users,
        private readonly TimesMapper $mapper,
    ) {
    }

    #[Route('/api/lobby', name: 'api_lobby', methods: ['GET'])]
    #[OA\Parameter(name: 'cursor', in: 'query', description: '前のページの nextCursor', schema: new OA\Schema(type: 'string'))]
    #[OA\Response(response: 200, description: '全員の親投稿を新しい順に', content: new OA\JsonContent(ref: new Model(type: PostPage::class)))]
    public function lobby(#[MapQueryParameter] ?string $cursor = null): JsonResponse
    {
        ['items' => $items, 'nextCursor' => $next] = $this->posts->findLobbyPage(Cursor::parse($cursor), Cursor::PAGE_SIZE);

        return CacheHeaders::public($this->json(new PostPage($this->mapper->toPosts($items), $next)), CacheHeaders::FRESH);
    }

    #[Route('/api/rooms/popular', name: 'api_rooms_popular', methods: ['GET'])]
    #[OA\Response(
        response: 200,
        description: '過去24時間のリアクション数＋返信数（本人以外から）の多い部屋',
        content: new OA\JsonContent(type: 'array', items: new OA\Items(ref: new Model(type: RoomSummary::class))),
    )]
    public function popular(): JsonResponse
    {
        $scores = $this->posts->findPopularRoomScores(self::POPULAR_LIMIT);
        $ids = array_column($scores, 'author_id');
        $users = $this->users->findByIdsIndexed($ids);
        $latest = $this->posts->findLatestParentAtByAuthors($ids);

        $rooms = [];
        foreach ($scores as ['author_id' => $id, 'score' => $score]) {
            if (isset($users[$id])) {
                $rooms[] = $this->mapper->toRoom($users[$id], $latest[$id] ?? null, $score);
            }
        }

        return CacheHeaders::public($this->json($rooms), CacheHeaders::AGGREGATE);
    }
}
