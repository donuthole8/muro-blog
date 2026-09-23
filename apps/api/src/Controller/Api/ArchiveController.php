<?php

declare(strict_types=1);

namespace App\Controller\Api;

use App\Dto\ArchivedPostDetail;
use App\Dto\PaginatedArchivedPosts;
use App\Dto\TagWithCount;
use App\Dto\ValidationError;
use App\Http\CacheHeaders;
use App\Repository\ArchivedPostRepository;
use App\Repository\TagRepository;
use App\Service\ArchiveMapper;
use Nelmio\ApiDocBundle\Attribute\Model;
use OpenApi\Attributes as OA;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Attribute\MapQueryParameter;
use Symfony\Component\Routing\Attribute\Route;

/**
 * 旧ブログ記事のアーカイブ。読み取り専用。
 * フロントエンドはビルド時にこれを叩いて /posts/:slug を静的化する。
 */
#[OA\Tag(name: 'archive')]
#[Route('/api/archive')]
final class ArchiveController extends AbstractController
{
    private const DEFAULT_PER_PAGE = 10;
    private const MAX_PER_PAGE = 50;

    public function __construct(
        private readonly ArchivedPostRepository $posts,
        private readonly TagRepository $tags,
        private readonly ArchiveMapper $mapper,
    ) {
    }

    #[Route('/posts', name: 'api_archive_posts_index', methods: ['GET'])]
    #[OA\Parameter(name: 'page', in: 'query', description: '1 始まりのページ番号', schema: new OA\Schema(type: 'integer', default: 1, minimum: 1))]
    #[OA\Parameter(name: 'perPage', in: 'query', description: '1ページあたりの件数', schema: new OA\Schema(type: 'integer', default: self::DEFAULT_PER_PAGE, maximum: self::MAX_PER_PAGE, minimum: 1))]
    #[OA\Parameter(name: 'tag', in: 'query', description: 'タグの slug で絞り込む', schema: new OA\Schema(type: 'string'))]
    #[OA\Response(
        response: 200,
        description: '公開済み記事の一覧を新しい順で返す',
        content: new OA\JsonContent(ref: new Model(type: PaginatedArchivedPosts::class)),
    )]
    public function index(
        #[MapQueryParameter] int $page = 1,
        #[MapQueryParameter] int $perPage = self::DEFAULT_PER_PAGE,
        #[MapQueryParameter] ?string $tag = null,
    ): JsonResponse {
        $page = max(1, $page);
        $perPage = min(self::MAX_PER_PAGE, max(1, $perPage));

        ['items' => $items, 'total' => $total] = $this->posts->findPublished($page, $perPage, $tag);

        return CacheHeaders::public($this->json(new PaginatedArchivedPosts(
            items: array_map($this->mapper->toSummary(...), $items),
            total: $total,
            page: $page,
            perPage: $perPage,
            totalPages: (int) ceil($total / $perPage),
        )), CacheHeaders::ARCHIVE);
    }

    #[Route('/posts/{slug}', name: 'api_archive_posts_show', requirements: ['slug' => '[a-z0-9-]+'], methods: ['GET'])]
    #[OA\Response(
        response: 200,
        description: '記事の詳細',
        content: new OA\JsonContent(ref: new Model(type: ArchivedPostDetail::class)),
    )]
    #[OA\Response(response: 404, description: '記事が存在しないか、公開されていない', content: new OA\JsonContent(ref: new Model(type: ValidationError::class)))]
    public function show(string $slug): JsonResponse
    {
        $post = $this->posts->findPublishedBySlug($slug);

        if (null === $post) {
            return new JsonResponse(['message' => '記事が見つかりません。', 'errors' => new \stdClass()], 404);
        }

        return CacheHeaders::public($this->json($this->mapper->toDetail($post)), CacheHeaders::ARCHIVE);
    }

    #[Route('/tags', name: 'api_archive_tags_index', methods: ['GET'])]
    #[OA\Response(
        response: 200,
        description: 'アーカイブ記事を持つタグを、記事数の多い順に返す',
        content: new OA\JsonContent(type: 'array', items: new OA\Items(ref: new Model(type: TagWithCount::class))),
    )]
    public function tags(): JsonResponse
    {
        return CacheHeaders::public($this->json(array_map(
            $this->mapper->toTagWithCount(...),
            $this->tags->findAllWithArchivedCount(),
        )), CacheHeaders::ARCHIVE);
    }
}
