<?php

declare(strict_types=1);

namespace App\Dto;

use OpenApi\Attributes as OA;

/** 投稿者などとして埋め込む最小限のユーザー情報。 */
final readonly class UserSummary
{
    public function __construct(
        #[OA\Property(example: 'alice')]
        public string $handle,
        #[OA\Property(example: 'Alice')]
        public string $displayName,
        #[OA\Property(nullable: true)]
        public ?string $avatarUrl,
    ) {
    }
}
