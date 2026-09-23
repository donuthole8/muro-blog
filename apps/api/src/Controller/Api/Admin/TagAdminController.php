<?php

declare(strict_types=1);

namespace App\Controller\Api\Admin;

use App\Dto\TagInput;
use App\Dto\TagSummary;
use App\Entity\Tag;
use App\Repository\TagRepository;
use App\Service\PostMapper;
use Doctrine\ORM\EntityManagerInterface;
use Nelmio\ApiDocBundle\Attribute\Model;
use Nelmio\ApiDocBundle\Attribute\Security;
use OpenApi\Attributes as OA;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Attribute\MapRequestPayload;
use Symfony\Component\Routing\Attribute\Route;

#[OA\Tag(name: 'admin')]
#[Security(name: 'AdminToken')]
#[Route('/api/admin/tags')]
final class TagAdminController extends AbstractController
{
    public function __construct(
        private readonly TagRepository $tags,
        private readonly PostMapper $mapper,
        private readonly EntityManagerInterface $em,
    ) {
    }

    #[Route('', name: 'api_admin_tags_index', methods: ['GET'])]
    #[OA\Response(
        response: 200,
        description: '全タグ（記事が0件のものも含む）',
        content: new OA\JsonContent(type: 'array', items: new OA\Items(ref: new Model(type: TagSummary::class))),
    )]
    public function index(): JsonResponse
    {
        $tags = $this->tags->findBy([], ['name' => 'ASC']);

        return $this->json(array_map($this->mapper->toTagSummary(...), $tags));
    }

    #[Route('', name: 'api_admin_tags_create', methods: ['POST'])]
    #[OA\RequestBody(content: new OA\JsonContent(ref: new Model(type: TagInput::class)))]
    #[OA\Response(response: 201, description: '作成されたタグ', content: new OA\JsonContent(ref: new Model(type: TagSummary::class)))]
    #[OA\Response(response: 409, description: '同じ名前か slug のタグが既にある')]
    public function create(#[MapRequestPayload] TagInput $input): JsonResponse
    {
        if (null !== $this->tags->findOneBySlug($input->slug)) {
            return $this->json(['message' => sprintf('slug "%s" のタグは既にあります。', $input->slug)], 409);
        }
        if (null !== $this->tags->findOneBy(['name' => $input->name])) {
            return $this->json(['message' => sprintf('タグ名 "%s" は既にあります。', $input->name)], 409);
        }

        $tag = (new Tag())->setName($input->name)->setSlug($input->slug);
        $this->em->persist($tag);
        $this->em->flush();

        return $this->json($this->mapper->toTagSummary($tag), 201);
    }
}
