<?php

declare(strict_types=1);

namespace App\Dto;

use OpenApi\Attributes as OA;

final readonly class AdminUser
{
    public function __construct(
        public string $id,
        #[OA\Property(nullable: true)]
        public ?string $handle,
        public string $displayName,
        #[OA\Property(nullable: true)]
        public ?string $avatarUrl,
        #[OA\Property(enum: ['user', 'admin'])]
        public string $role,
        #[OA\Property(format: 'date-time', nullable: true)]
        public ?string $suspendedAt,
        #[OA\Property(format: 'date-time')]
        public string $createdAt,
    ) {
    }
}
