<?php

declare(strict_types=1);

namespace App\Dto;

use Nelmio\ApiDocBundle\Attribute\Model;
use OpenApi\Attributes as OA;

/** 記事詳細。表示用の HTML を含む。 */
final readonly class PostDetail
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
        public ?string $excerpt,
        #[OA\Property(description: 'Markdown から変換済みの HTML')]
        public string $bodyHtml,
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
