<?php

declare(strict_types=1);

namespace App\Dto;

use OpenApi\Attributes as OA;

final readonly class SessionIssued
{
    public function __construct(
        #[OA\Property(description: 'セッショントークン。Worker が HttpOnly Cookie に入れる')]
        public string $token,
        #[OA\Property(format: 'date-time')]
        public string $expiresAt,
        #[OA\Property(description: 'handle が未決定なら true（handle 決定画面へ誘導する）')]
        public bool $needsHandle,
    ) {
    }
}
