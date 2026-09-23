<?php

declare(strict_types=1);

namespace App\Dto;

use Nelmio\ApiDocBundle\Attribute\Model;
use OpenApi\Attributes as OA;

/** 検索結果。部屋（ユーザー）は1ページ目にだけ入れる。 */
final readonly class SearchResult
{
    /**
     * @param list<UserSummary> $users
     * @param list<TimesPost>   $items
     */
    public function __construct(
        /** @var list<UserSummary> */
        #[OA\Property(type: 'array', items: new OA\Items(ref: new Model(type: UserSummary::class)), description: 'handle か表示名が一致した部屋（最大10件。2ページ目以降は空）')]
        public array $users,
        /** @var list<TimesPost> */
        #[OA\Property(type: 'array', items: new OA\Items(ref: new Model(type: TimesPost::class)), description: '本文が一致した親投稿（新しい順）')]
        public array $items,
        #[OA\Property(nullable: true)]
        public ?string $nextCursor,
    ) {
    }
}
