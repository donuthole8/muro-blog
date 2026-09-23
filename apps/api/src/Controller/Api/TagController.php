<?php

declare(strict_types=1);

namespace App\Controller\Api;

use App\Dto\TagPostPage;
use App\Dto\TagSummary;
use App\Dto\TagWithCount;
use App\Dto\ValidationError;
use App\Http\CacheHeaders;
use App\Http\Cursor;
use App\Repository\PostRepository;
use App\Repository\TagRepository;
use App\Service\ArchiveMapper;
use App\Service\TimesMapper;
use Nelmio\ApiDocBundle\Attribute\Model;
use OpenApi\Attributes as OA;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Attribute\MapQueryParameter;
use Symfony\Component\Routing\Attribute\Route;

/** トピックタグ。 */
#[OA\Tag(name: 'discover')]
#[Route('/api/tags')]
final class TagController extends ApiController
{
    public function __construct(
        private readonly TagRepository $tags,
        private readonly PostRepository $posts,
        private readonly ArchiveMapper $archiveMapper,
        private readonly TimesMapper $mapper,
    ) {
    }

    #[Route('', name: 'api_tags_index', methods: ['GET'])]
    #[OA\Response(
        response: 200,
        description: '全タグ（投稿0件も含む）を投稿数の多い順に。投稿時のタグ選択にも使う',
        content: new OA\JsonContent(type: 'array', items: new OA\Items(ref: new Model(type: TagWithCount::class))),
    )]
    public function index(): JsonResponse
    {
        return CacheHeaders::public($this->json(array_map(
            $this->archiveMapper->toTagWithCount(...),
            $this->tags->findAllWithPostCount(),
        )), CacheHeaders::AGGREGATE);
    }

    #[Route('/{slug}/posts', name: 'api_tags_posts', requirements: ['slug' => '[a-z0-9-]+'], methods: ['GET'])]
    #[OA\Parameter(name: 'cursor', in: 'query', description: '前のページの nextCursor', schema: new OA\Schema(type: 'string'))]
    #[OA\Response(response: 200, description: 'タグ付きの親投稿を新しい順に', content: new OA\JsonContent(ref: new Model(type: TagPostPage::class)))]
    #[OA\Response(response: 404, description: 'タグが存在しない', content: new OA\JsonContent(ref: new Model(type: ValidationError::class)))]
    public function posts(string $slug, #[MapQueryParameter] ?string $cursor = null): JsonResponse
    {
        $tag = $this->tags->findOneBySlug($slug);
        if (null === $tag) {
            return $this->notFound('タグが見つかりません。');
        }

        ['items' => $items, 'nextCursor' => $next] = $this->posts->findTagPage($tag, Cursor::parse($cursor), Cursor::PAGE_SIZE);

        return CacheHeaders::public($this->json(new TagPostPage(
            tag: new TagSummary($tag->getName(), $tag->getSlug()),
            items: $this->mapper->toPosts($items),
            nextCursor: $next,
        )), CacheHeaders::FRESH);
    }
}
