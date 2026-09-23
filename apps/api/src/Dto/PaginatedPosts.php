<?php

declare(strict_types=1);

namespace App\Dto;

use Nelmio\ApiDocBundle\Attribute\Model;
use OpenApi\Attributes as OA;

final readonly class PaginatedPosts
{
    /**
     * @param list<PostSummary> $items
     */
    public function __construct(
        /** @var list<PostSummary> */
        #[OA\Property(type: 'array', items: new OA\Items(ref: new Model(type: PostSummary::class)))]
        public array $items,
        #[OA\Property(description: '全件数', example: 42)]
        public int $total,
        public int $page,
        public int $perPage,
        public int $totalPages,
    ) {
    }
}
