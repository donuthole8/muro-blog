<?php

declare(strict_types=1);

namespace App\Dto;

use OpenApi\Attributes as OA;

/** 削除結果。Worker はこれを見て R2 の画像も消す（API からは R2 に触れないため）。 */
final readonly class PostDeleted
{
    public function __construct(
        #[OA\Property(nullable: true, description: '消えた画像のキー')]
        public ?string $imageKey,
    ) {
    }
}
