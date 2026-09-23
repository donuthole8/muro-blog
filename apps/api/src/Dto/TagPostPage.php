<?php

declare(strict_types=1);

namespace App\Dto;

use Nelmio\ApiDocBundle\Attribute\Model;
use OpenApi\Attributes as OA;

final readonly class TagPostPage
{
    /**
     * @param list<TimesPost> $items
     */
    public function __construct(
        #[OA\Property(ref: new Model(type: TagSummary::class))]
        public TagSummary $tag,
        /** @var list<TimesPost> */
        #[OA\Property(type: 'array', items: new OA\Items(ref: new Model(type: TimesPost::class)))]
        public array $items,
        #[OA\Property(nullable: true)]
        public ?string $nextCursor,
    ) {
    }
}
