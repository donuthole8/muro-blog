<?php

declare(strict_types=1);

namespace App\Dto;

use Nelmio\ApiDocBundle\Attribute\Model;
use OpenApi\Attributes as OA;

/** カーソル方式の1ページ分。 */
final readonly class PostPage
{
    /**
     * @param list<TimesPost> $items
     */
    public function __construct(
        /** @var list<TimesPost> */
        #[OA\Property(type: 'array', items: new OA\Items(ref: new Model(type: TimesPost::class)))]
        public array $items,
        #[OA\Property(nullable: true, description: '次のページを取るときに ?cursor= に渡す。最後のページなら null')]
        public ?string $nextCursor,
    ) {
    }
}
