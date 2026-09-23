<?php

declare(strict_types=1);

namespace App\Controller\Api\Admin;

use App\Dto\PostAdminDetail;
use App\Dto\PostAdminSummary;
use App\Dto\PostInput;
use App\Dto\ValidationError;
use App\Entity\Post;
use App\Enum\PostStatus;
use App\Repository\PostRepository;
use App\Service\PostMapper;
use App\Service\PostWriter;
use Doctrine\ORM\EntityManagerInterface;
use Nelmio\ApiDocBundle\Attribute\Model;
use Nelmio\ApiDocBundle\Attribute\Security;
use OpenApi\Attributes as OA;
use Symfony\Bridge\Doctrine\Attribute\MapEntity;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Attribute\MapQueryParameter;
use Symfony\Component\HttpKernel\Attribute\MapRequestPayload;
use Symfony\Component\Routing\Attribute\Route;

/**
 * 管理 API。X-Admin-Token ヘッダーが必要。
 * 下書きを含む全記事を扱う。
 */
#[OA\Tag(name: 'admin')]
#[Security(name: 'AdminToken')]
#[Route('/api/admin/posts')]
final class PostAdminController extends AbstractController
{
    public function __construct(
        private readonly PostRepository $posts,
        private readonly PostWriter $writer,
        private readonly PostMapper $mapper,
        private readonly EntityManagerInterface $em,
    ) {
    }

    #[Route('', name: 'api_admin_posts_index', methods: ['GET'])]
    #[OA\Parameter(name: 'status', in: 'query', description: '状態で絞り込む', schema: new OA\Schema(type: 'string', enum: ['draft', 'published']))]
    #[OA\Response(
        response: 200,
        description: '下書きを含む全記事を更新の新しい順で返す',
        content: new OA\JsonContent(type: 'array', items: new OA\Items(ref: new Model(type: PostAdminSummary::class))),
    )]
    public function index(#[MapQueryParameter] ?string $status = null): JsonResponse
    {
        $filter = null !== $status ? PostStatus::tryFrom($status) : null;

        return $this->json(array_map(
            $this->mapper->toAdminSummary(...),
            $this->posts->findAllForAdmin($filter),
        ));
    }

    #[Route('', name: 'api_admin_posts_create', methods: ['POST'])]
    #[OA\RequestBody(content: new OA\JsonContent(ref: new Model(type: PostInput::class)))]
    #[OA\Response(response: 201, description: '作成された記事', content: new OA\JsonContent(ref: new Model(type: PostAdminDetail::class)))]
    #[OA\Response(response: 409, description: 'slug が既に使われている', content: new OA\JsonContent(ref: new Model(type: ValidationError::class)))]
    #[OA\Response(response: 422, description: '入力値が不正', content: new OA\JsonContent(ref: new Model(type: ValidationError::class)))]
    public function create(#[MapRequestPayload] PostInput $input): JsonResponse
    {
        $post = $this->writer->create($input);

        return $this->json($this->mapper->toAdminDetail($post), 201);
    }

    #[Route('/{id}', name: 'api_admin_posts_show', requirements: ['id' => '\d+'], methods: ['GET'])]
    #[OA\Parameter(name: 'id', in: 'path', required: true, description: '記事 ID', schema: new OA\Schema(type: 'integer'))]
    #[OA\Response(response: 200, description: '編集用の記事（Markdown 原文を含む）', content: new OA\JsonContent(ref: new Model(type: PostAdminDetail::class)))]
    #[OA\Response(response: 404, description: '記事が存在しない', content: new OA\JsonContent(ref: new Model(type: ValidationError::class)))]
    public function show(#[MapEntity(id: 'id')] Post $post): JsonResponse
    {
        return $this->json($this->mapper->toAdminDetail($post));
    }

    #[Route('/{id}', name: 'api_admin_posts_update', requirements: ['id' => '\d+'], methods: ['PUT'])]
    #[OA\Parameter(name: 'id', in: 'path', required: true, description: '記事 ID', schema: new OA\Schema(type: 'integer'))]
    #[OA\RequestBody(content: new OA\JsonContent(ref: new Model(type: PostInput::class)))]
    #[OA\Response(response: 200, description: '更新後の記事', content: new OA\JsonContent(ref: new Model(type: PostAdminDetail::class)))]
    public function update(
        #[MapEntity(id: 'id')] Post $post,
        #[MapRequestPayload] PostInput $input,
    ): JsonResponse {
        return $this->json($this->mapper->toAdminDetail($this->writer->update($post, $input)));
    }

    #[Route('/{id}', name: 'api_admin_posts_delete', requirements: ['id' => '\d+'], methods: ['DELETE'])]
    #[OA\Parameter(name: 'id', in: 'path', required: true, description: '記事 ID', schema: new OA\Schema(type: 'integer'))]
    #[OA\Response(response: 204, description: '削除完了')]
    public function delete(#[MapEntity(id: 'id')] Post $post): JsonResponse
    {
        $this->em->remove($post);
        $this->em->flush();

        return new JsonResponse(null, 204);
    }

    #[Route('/{id}/publish', name: 'api_admin_posts_publish', requirements: ['id' => '\d+'], methods: ['POST'])]
    #[OA\Parameter(name: 'id', in: 'path', required: true, description: '記事 ID', schema: new OA\Schema(type: 'integer'))]
    #[OA\Response(response: 200, description: '公開後の記事', content: new OA\JsonContent(ref: new Model(type: PostAdminDetail::class)))]
    public function publish(#[MapEntity(id: 'id')] Post $post): JsonResponse
    {
        $post->publish();
        $this->em->flush();

        return $this->json($this->mapper->toAdminDetail($post));
    }

    #[Route('/{id}/unpublish', name: 'api_admin_posts_unpublish', requirements: ['id' => '\d+'], methods: ['POST'])]
    #[OA\Parameter(name: 'id', in: 'path', required: true, description: '記事 ID', schema: new OA\Schema(type: 'integer'))]
    #[OA\Response(response: 200, description: '下書きに戻した記事', content: new OA\JsonContent(ref: new Model(type: PostAdminDetail::class)))]
    public function unpublish(#[MapEntity(id: 'id')] Post $post): JsonResponse
    {
        $post->unpublish();
        $this->em->flush();

        return $this->json($this->mapper->toAdminDetail($post));
    }
}
