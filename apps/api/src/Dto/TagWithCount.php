<?php

declare(strict_types=1);

namespace App\Dto;

use OpenApi\Attributes as OA;

final readonly class TagWithCount
{
    public function __construct(
        #[OA\Property(example: 'JavaScript')]
        public string $name,
        #[OA\Property(example: 'javascript')]
        public string $slug,
        #[OA\Property(description: '投稿（アーカイブの場合は記事）の件数', example: 12)]
        public int $postCount,
    ) {
    }
}
