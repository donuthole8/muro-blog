<?php

declare(strict_types=1);

namespace App\Dto;

use Nelmio\ApiDocBundle\Attribute\Model;
use OpenApi\Attributes as OA;

/** 管理画面の一覧。下書きも含むため status を持つ。 */
final readonly class PostAdminSummary
{
    /**
     * @param list<TagSummary> $tags
     */
    public function __construct(
        public int $id,
        public string $slug,
        public string $title,
        #[OA\Property(nullable: true, example: '📝')]
        public ?string $emoji,
        #[OA\Property(enum: ['draft', 'published'], example: 'draft')]
        public string $status,
        #[OA\Property(format: 'date-time')]
        public ?string $publishedAt,
        #[OA\Property(format: 'date-time')]
        public string $updatedAt,
        /** @var list<TagSummary> */
        #[OA\Property(type: 'array', items: new OA\Items(ref: new Model(type: TagSummary::class)))]
        public array $tags,
    ) {
    }
}
