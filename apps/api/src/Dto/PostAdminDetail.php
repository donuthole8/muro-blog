<?php

declare(strict_types=1);

namespace App\Dto;

use Nelmio\ApiDocBundle\Attribute\Model;
use OpenApi\Attributes as OA;

/** 編集画面用。Markdown 原文を返すのがポイント。 */
final readonly class PostAdminDetail
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
        #[OA\Property(description: 'Markdown 原文')]
        public string $bodyMd,
        public ?string $excerpt,
        #[OA\Property(enum: ['draft', 'published'])]
        public string $status,
        #[OA\Property(format: 'date-time')]
        public ?string $publishedAt,
        #[OA\Property(format: 'date-time')]
        public string $createdAt,
        #[OA\Property(format: 'date-time')]
        public string $updatedAt,
        /** @var list<TagSummary> */
        #[OA\Property(type: 'array', items: new OA\Items(ref: new Model(type: TagSummary::class)))]
        public array $tags,
    ) {
    }
}
