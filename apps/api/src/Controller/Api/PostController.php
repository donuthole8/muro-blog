<?php

declare(strict_types=1);

namespace App\Controller\Api;

use App\Dto\PaginatedPosts;
use App\Dto\PostDetail;
use App\Dto\ValidationError;
use App\Repository\PostRepository;
use App\Service\PostMapper;
use Nelmio\ApiDocBundle\Attribute\Model;
use OpenApi\Attributes as OA;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Attribute\MapQueryParameter;
use Symfony\Component\Routing\Attribute\Route;

/**
 * 公開 API。認証不要・読み取り専用。
 * フロントエンドのプリレンダリングはこのエンドポイント群だけを叩く。
 */
#[OA\Tag(name: 'posts')]
#[Route('/api/posts')]
final class PostController extends AbstractController
{
    private const DEFAULT_PER_PAGE = 10;
    private const MAX_PER_PAGE = 50;

    public function __construct(
        private readonly PostRepository $posts,
        private readonly PostMapper $mapper,
    ) {
    }

    #[Route('', name: 'api_posts_index', methods: ['GET'])]
    #[OA\Parameter(name: 'page', in: 'query', description: '1 始まりのページ番号', schema: new OA\Schema(type: 'integer', default: 1, minimum: 1))]
    #[OA\Parameter(name: 'perPage', in: 'query', description: '1ページあたりの件数', schema: new OA\Schema(type: 'integer', default: self::DEFAULT_PER_PAGE, maximum: self::MAX_PER_PAGE, minimum: 1))]
    #[OA\Parameter(name: 'tag', in: 'query', description: 'タグの slug で絞り込む', schema: new OA\Schema(type: 'string'))]
    #[OA\Response(
        response: 200,
        description: '公開済み記事の一覧を新しい順で返す',
        content: new OA\JsonContent(ref: new Model(type: PaginatedPosts::class)),
    )]
    public function index(
        #[MapQueryParameter] int $page = 1,
        #[MapQueryParameter] int $perPage = self::DEFAULT_PER_PAGE,
        #[MapQueryParameter] ?string $tag = null,
    ): JsonResponse {
        $page = max(1, $page);
        $perPage = min(self::MAX_PER_PAGE, max(1, $perPage));

        ['items' => $items, 'total' => $total] = $this->posts->findPublished($page, $perPage, $tag);

        return $this->json(new PaginatedPosts(
            items: array_map($this->mapper->toSummary(...), $items),
            total: $total,
            page: $page,
            perPage: $perPage,
            totalPages: (int) ceil($total / $perPage),
        ));
    }

    #[Route('/{slug}', name: 'api_posts_show', requirements: ['slug' => '[a-z0-9-]+'], methods: ['GET'])]
    #[OA\Response(
        response: 200,
        description: '記事の詳細',
        content: new OA\JsonContent(ref: new Model(type: PostDetail::class)),
    )]
    #[OA\Response(response: 404, description: '記事が存在しないか、まだ公開されていない', content: new OA\JsonContent(ref: new Model(type: ValidationError::class)))]
    public function show(string $slug): JsonResponse
    {
        $post = $this->posts->findPublishedBySlug($slug);

        if (null === $post) {
            return $this->json(['message' => '記事が見つかりません。'], 404);
        }

        return $this->json($this->mapper->toDetail($post));
    }
}
