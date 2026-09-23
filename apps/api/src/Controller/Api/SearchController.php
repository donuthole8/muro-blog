<?php

declare(strict_types=1);

namespace App\Controller\Api;

use App\Dto\SearchResult;
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

/**
 * 投稿本文と部屋（handle・表示名）の検索。
 *
 * 公開データだけを返すのでエッジでキャッシュできる。同じ語の検索が続いても
 * DB まで届かないよう、鮮度は新着と同じ 15 秒にする。
 */
#[OA\Tag(name: 'discover')]
final class SearchController extends ApiController
{
    private const MAX_QUERY_LENGTH = 100;
    private const MAX_TERMS = 5;
    private const USER_LIMIT = 10;

    public function __construct(
        private readonly PostRepository $posts,
        private readonly UserRepository $users,
        private readonly TimesMapper $mapper,
    ) {
    }

    #[Route('/api/search', name: 'api_search', methods: ['GET'])]
    #[OA\Parameter(name: 'q', in: 'query', required: true, description: '検索語。空白で区切るとすべてを含むものに絞る', schema: new OA\Schema(type: 'string'))]
    #[OA\Parameter(name: 'cursor', in: 'query', description: '前のページの nextCursor', schema: new OA\Schema(type: 'string'))]
    #[OA\Response(response: 200, description: '検索結果', content: new OA\JsonContent(ref: new Model(type: SearchResult::class)))]
    public function search(#[MapQueryParameter] ?string $q = null, #[MapQueryParameter] ?string $cursor = null): JsonResponse
    {
        $terms = self::terms((string) $q);
        if ([] === $terms) {
            return CacheHeaders::public($this->json(new SearchResult([], [], null)), CacheHeaders::FRESH);
        }

        $after = Cursor::parse($cursor);
        ['items' => $items, 'nextCursor' => $next] = $this->posts->findSearchPage($terms, $after, Cursor::PAGE_SIZE);
        $users = null === $after
            ? array_values(array_filter(array_map(
                $this->mapper->toUserSummary(...),
                $this->users->searchRoomOwners($terms, self::USER_LIMIT),
            )))
            : [];

        return CacheHeaders::public(
            $this->json(new SearchResult($users, $this->mapper->toPosts($items), $next)),
            CacheHeaders::FRESH,
        );
    }

    /** @return list<string> */
    private static function terms(string $query): array
    {
        $query = mb_substr(trim($query), 0, self::MAX_QUERY_LENGTH);
        $terms = preg_split('/[\s　]+/u', $query, -1, PREG_SPLIT_NO_EMPTY) ?: [];

        return array_slice(array_values(array_unique($terms)), 0, self::MAX_TERMS);
    }
}
