<?php

declare(strict_types=1);

namespace App\Dto;

use Nelmio\ApiDocBundle\Attribute\Model;
use OpenApi\Attributes as OA;

/** アーカイブ一覧に出す記事。本文は含まない。 */
final readonly class ArchivedPostSummary
{
    /**
     * @param list<TagSummary> $tags
     */
    public function __construct(
        public int $id,
        #[OA\Property(example: 'hello-world')]
        public string $slug,
        public string $title,
        #[OA\Property(nullable: true, example: '📝')]
        public ?string $emoji,
        public ?string $excerpt,
        #[OA\Property(format: 'date-time', example: '2026-09-06T12:00:00+00:00')]
        public ?string $publishedAt,
        /** @var list<TagSummary> */
        #[OA\Property(type: 'array', items: new OA\Items(ref: new Model(type: TagSummary::class)))]
        public array $tags,
    ) {
    }
}
