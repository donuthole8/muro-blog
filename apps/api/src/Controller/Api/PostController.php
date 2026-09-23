<?php

declare(strict_types=1);

namespace App\Controller\Api;

use App\Dto\PostDeleted;
use App\Dto\PostInput;
use App\Dto\PostSource;
use App\Dto\PostUpdateInput;
use App\Dto\Thread;
use App\Dto\TimesPost;
use App\Dto\ValidationError;
use App\Entity\Post;
use App\Http\CacheHeaders;
use App\Repository\PostRepository;
use App\Service\TimesMapper;
use App\Service\TimesPostWriter;
use Nelmio\ApiDocBundle\Attribute\Model;
use Nelmio\ApiDocBundle\Attribute\Security;
use OpenApi\Attributes as OA;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Attribute\MapRequestPayload;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Routing\Requirement\Requirement;
use Symfony\Component\Security\Http\Attribute\IsGranted;
use Symfony\Component\Uid\Ulid;

#[OA\Tag(name: 'posts')]
#[Route('/api/posts')]
final class PostController extends ApiController
{
    public function __construct(
        private readonly PostRepository $posts,
        private readonly TimesPostWriter $writer,
        private readonly TimesMapper $mapper,
    ) {
    }

    #[Route('/{id}', name: 'api_posts_show', requirements: ['id' => Requirement::ULID], methods: ['GET'])]
    #[OA\Response(response: 200, description: 'スレッド（親投稿と返信）', content: new OA\JsonContent(ref: new Model(type: Thread::class)))]
    #[OA\Response(response: 404, description: 'スレッドがない（返信の ID を指定した場合も 404）', content: new OA\JsonContent(ref: new Model(type: ValidationError::class)))]
    public function show(string $id): JsonResponse
    {
        $post = $this->posts->findOneById(Ulid::fromString($id));

        // 返信が1件もない削除済みの親投稿は、スレッドとしても存在しない扱いにする
        if (null === $post || $post->isReply() || (!$post->isVisible() && 0 === $post->getReplyCount())) {
            return $this->notFound('スレッドが見つかりません。');
        }

        $replies = $this->posts->findReplies($post);
        $this->posts->preloadTags([$post]);
        $mapped = $this->mapper->toPosts([$post, ...$replies]);

        return CacheHeaders::public($this->json(new Thread($mapped[0], array_slice($mapped, 1))), CacheHeaders::FRESH);
    }

    #[Route('/{id}/source', name: 'api_posts_source', requirements: ['id' => Requirement::ULID], methods: ['GET'])]
    #[Security(name: 'SessionToken')]
    #[IsGranted('ROLE_USER')]
    #[OA\Response(response: 200, description: '編集用の Markdown 原文（本人のみ）', content: new OA\JsonContent(ref: new Model(type: PostSource::class)))]
    #[OA\Response(response: 404, description: '投稿が存在しないか、自分の投稿ではない', content: new OA\JsonContent(ref: new Model(type: ValidationError::class)))]
    public function source(string $id): JsonResponse
    {
        $post = $this->find($id);
        if (null === $post || !$post->isVisible() || !$post->getAuthor()->getId()->equals($this->currentUser()->getId())) {
            return $this->notFound('投稿が見つかりません。');
        }

        return CacheHeaders::private($this->json(new PostSource($post->getBodyMarkdown())));
    }

    #[Route('', name: 'api_posts_create', methods: ['POST'])]
    #[Security(name: 'SessionToken')]
    #[IsGranted('ROLE_USER')]
    #[OA\RequestBody(content: new OA\JsonContent(ref: new Model(type: PostInput::class)))]
    #[OA\Response(response: 201, description: '作成された投稿', content: new OA\JsonContent(ref: new Model(type: TimesPost::class)))]
    #[OA\Response(response: 403, description: '返信先の投稿者にブロックされている', content: new OA\JsonContent(ref: new Model(type: ValidationError::class)))]
    #[OA\Response(response: 422, description: '入力値が不正', content: new OA\JsonContent(ref: new Model(type: ValidationError::class)))]
    #[OA\Response(response: 429, description: '投稿回数の上限に達した（Retry-After ヘッダー付き）', content: new OA\JsonContent(ref: new Model(type: ValidationError::class)))]
    public function create(#[MapRequestPayload] PostInput $input): JsonResponse
    {
        $post = $this->writer->create($this->activeUser(), $input);

        return CacheHeaders::private($this->json($this->mapper->toPost($post), 201));
    }

    #[Route('/{id}', name: 'api_posts_update', requirements: ['id' => Requirement::ULID], methods: ['PUT'])]
    #[Security(name: 'SessionToken')]
    #[IsGranted('ROLE_USER')]
    #[OA\RequestBody(content: new OA\JsonContent(ref: new Model(type: PostUpdateInput::class)))]
    #[OA\Response(response: 200, description: '編集後の投稿', content: new OA\JsonContent(ref: new Model(type: TimesPost::class)))]
    #[OA\Response(response: 403, description: '自分の投稿ではない', content: new OA\JsonContent(ref: new Model(type: ValidationError::class)))]
    #[OA\Response(response: 422, description: '入力値が不正', content: new OA\JsonContent(ref: new Model(type: ValidationError::class)))]
    public function update(string $id, #[MapRequestPayload] PostUpdateInput $input): JsonResponse
    {
        $post = $this->find($id);
        if (null === $post) {
            return $this->notFound('投稿が見つかりません。');
        }

        $this->writer->update($this->activeUser(), $post, $input);
        $this->posts->preloadTags([$post]);

        return CacheHeaders::private($this->json($this->mapper->toPosts([$post])[0]));
    }

    #[Route('/{id}', name: 'api_posts_delete', requirements: ['id' => Requirement::ULID], methods: ['DELETE'])]
    #[Security(name: 'SessionToken')]
    #[IsGranted('ROLE_USER')]
    #[OA\Response(response: 200, description: '削除した（親投稿は返信を残して「削除されました」になる）', content: new OA\JsonContent(ref: new Model(type: PostDeleted::class)))]
    #[OA\Response(response: 403, description: '自分の投稿ではない', content: new OA\JsonContent(ref: new Model(type: ValidationError::class)))]
    public function delete(string $id): JsonResponse
    {
        $post = $this->find($id);
        if (null === $post) {
            return $this->notFound('投稿が見つかりません。');
        }

        $imageKey = $this->writer->deleteAsAuthor($this->currentUser(), $post);

        return CacheHeaders::private($this->json(new PostDeleted($imageKey)));
    }

    private function find(string $id): ?Post
    {
        return $this->posts->findOneById(Ulid::fromString($id));
    }
}
