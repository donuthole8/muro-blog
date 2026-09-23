<?php

declare(strict_types=1);

namespace App\Dto;

use OpenApi\Attributes as OA;

final readonly class TagSummary
{
    public function __construct(
        #[OA\Property(example: 'JavaScript')]
        public string $name,
        #[OA\Property(example: 'javascript')]
        public string $slug,
    ) {
    }
}
