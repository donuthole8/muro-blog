<?php

declare(strict_types=1);

namespace App\Dto;

use OpenApi\Attributes as OA;

/** 部屋のヘッダーに出すプロフィール。 */
final readonly class UserProfile
{
    public function __construct(
        #[OA\Property(example: 'alice')]
        public string $handle,
        public string $displayName,
        #[OA\Property(nullable: true)]
        public ?string $avatarUrl,
        #[OA\Property(nullable: true)]
        public ?string $bio,
        #[OA\Property(nullable: true, description: '自己申告の所属（未認証）')]
        public ?string $companyName,
        #[OA\Property(nullable: true, description: '/org/{slug} の slug')]
        public ?string $companySlug,
        public int $followerCount,
        #[OA\Property(description: '利用停止中か。停止中の部屋は投稿を表示しない')]
        public bool $suspended,
        #[OA\Property(format: 'date-time')]
        public string $createdAt,
    ) {
    }
}
