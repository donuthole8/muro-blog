<?php

declare(strict_types=1);

namespace App\Dto;

use OpenApi\Attributes as OA;

final readonly class AuthorizationUrl
{
    public function __construct(
        #[OA\Property(description: 'Google の同意画面の URL')]
        public string $url,
        #[OA\Property(description: 'CSRF 対策の state。Worker が Cookie に控え、コールバックで照合する')]
        public string $state,
    ) {
    }
}
