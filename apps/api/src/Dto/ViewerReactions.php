<?php

declare(strict_types=1);

namespace App\Dto;

use OpenApi\Attributes as OA;

final readonly class ViewerReactions
{
    /**
     * @param list<string> $emojis
     */
    public function __construct(
        public string $postId,
        /** @var list<string> */
        #[OA\Property(type: 'array', items: new OA\Items(type: 'string'), description: '自分が付けた絵文字')]
        public array $emojis,
    ) {
    }
}
