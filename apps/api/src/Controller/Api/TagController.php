<?php

declare(strict_types=1);

namespace App\Controller\Api;

use App\Dto\TagWithCount;
use App\Repository\TagRepository;
use App\Service\PostMapper;
use Nelmio\ApiDocBundle\Attribute\Model;
use OpenApi\Attributes as OA;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;

#[OA\Tag(name: 'tags')]
#[Route('/api/tags')]
final class TagController extends AbstractController
{
    public function __construct(
        private readonly TagRepository $tags,
        private readonly PostMapper $mapper,
    ) {
    }

    #[Route('', name: 'api_tags_index', methods: ['GET'])]
    #[OA\Response(
        response: 200,
        description: '公開記事を持つタグを、記事数の多い順に返す',
        content: new OA\JsonContent(
            type: 'array',
            items: new OA\Items(ref: new Model(type: TagWithCount::class)),
        ),
    )]
    public function index(): JsonResponse
    {
        return $this->json(array_map(
            $this->mapper->toTagWithCount(...),
            $this->tags->findAllWithPublishedCount(),
        ));
    }
}
