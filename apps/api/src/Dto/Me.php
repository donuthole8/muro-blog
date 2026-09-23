<?php

declare(strict_types=1);

namespace App\Dto;

use OpenApi\Attributes as OA;

/** ログイン中の本人の情報。 */
final readonly class Me
{
    public function __construct(
        public string $id,
        #[OA\Property(nullable: true, description: '初回ログイン直後は未決定で null')]
        public ?string $handle,
        public string $displayName,
        #[OA\Property(nullable: true)]
        public ?string $avatarUrl,
        #[OA\Property(nullable: true)]
        public ?string $bio,
        #[OA\Property(nullable: true)]
        public ?string $companyName,
        #[OA\Property(nullable: true)]
        public ?string $companySlug,
        #[OA\Property(enum: ['user', 'admin'])]
        public string $role,
        public int $unreadNotificationCount,
    ) {
    }
}
