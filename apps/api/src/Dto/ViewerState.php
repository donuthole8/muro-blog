<?php

declare(strict_types=1);

namespace App\Dto;

use Nelmio\ApiDocBundle\Attribute\Model;
use OpenApi\Attributes as OA;

/**
 * 閲覧者ごとに変わる情報。公開 API の応答はエッジでキャッシュするので、
 * ここだけを別に取って画面上で重ねる。
 */
final readonly class ViewerState
{
    /**
     * @param list<ViewerReactions> $reactions
     * @param list<string>          $blockedHandles
     */
    public function __construct(
        /** @var list<ViewerReactions> */
        #[OA\Property(type: 'array', items: new OA\Items(ref: new Model(type: ViewerReactions::class)))]
        public array $reactions,
        #[OA\Property(nullable: true, description: 'handle を指定したときだけ。その部屋をフォローしているか')]
        public ?bool $isFollowing,
        /** @var list<string> */
        #[OA\Property(type: 'array', items: new OA\Items(type: 'string'), description: '自分がブロックしている handle（画面上で投稿を折りたたむ）')]
        public array $blockedHandles = [],
        #[OA\Property(nullable: true, description: 'handle を指定したときだけ。その人をブロックしているか')]
        public ?bool $isBlocking = null,
    ) {
    }
}
