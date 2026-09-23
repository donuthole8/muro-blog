<?php

declare(strict_types=1);

namespace App\Dto;

use Nelmio\ApiDocBundle\Attribute\Model;
use OpenApi\Attributes as OA;

final readonly class AdminPostPage
{
    /**
     * @param list<AdminPost> $items
     */
    public function __construct(
        /** @var list<AdminPost> */
        #[OA\Property(type: 'array', items: new OA\Items(ref: new Model(type: AdminPost::class)))]
        public array $items,
        #[OA\Property(nullable: true)]
        public ?string $nextCursor,
    ) {
    }
}
