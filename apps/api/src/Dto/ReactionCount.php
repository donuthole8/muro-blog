<?php

declare(strict_types=1);

namespace App\Dto;

use OpenApi\Attributes as OA;

final readonly class ReactionCount
{
    public function __construct(
        #[OA\Property(example: '👍')]
        public string $emoji,
        #[OA\Property(example: 3)]
        public int $count,
    ) {
    }
}
