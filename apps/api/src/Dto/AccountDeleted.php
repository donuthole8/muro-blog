<?php

declare(strict_types=1);

namespace App\Dto;

use OpenApi\Attributes as OA;

final readonly class AccountDeleted
{
    /**
     * @param list<string> $imageKeys
     */
    public function __construct(
        /** @var list<string> */
        #[OA\Property(type: 'array', items: new OA\Items(type: 'string'), description: 'Worker が R2 から消すべき画像のキー')]
        public array $imageKeys,
    ) {
    }
}
