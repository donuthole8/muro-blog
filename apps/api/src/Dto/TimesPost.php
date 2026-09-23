<?php

declare(strict_types=1);

namespace App\Dto;

use Nelmio\ApiDocBundle\Attribute\Model;
use OpenApi\Attributes as OA;

/**
 * times の投稿（親投稿・返信とも）。公開 API の応答なので閲覧者ごとの情報は含まない
 * （自分がリアクション済みかどうかは /api/me/viewer-state で別に取る）。
 */
final readonly class TimesPost
{
    /**
     * @param list<ReactionCount> $reactions
     * @param list<TagSummary>    $tags
     */
    public function __construct(
        #[OA\Property(description: 'ULID', example: '01J8Z3K6W2Q4Y7T9V1B3N5M7P9')]
        public string $id,
        #[OA\Property(nullable: true, description: '返信なら親投稿の ID')]
        public ?string $parentId,
        #[OA\Property(nullable: true, description: '退会したユーザーの投稿なら null', ref: new Model(type: UserSummary::class))]
        public ?UserSummary $author,
        #[OA\Property(
            enum: ['visible', 'deleted', 'hidden'],
            description: 'deleted: 本人が削除 / hidden: 管理者が非表示にしたか、投稿者が停止中。どちらも本文は空',
        )]
        public string $state,
        #[OA\Property(description: '変換済みの HTML。state が visible 以外なら空')]
        public string $bodyHtml,
        #[OA\Property(nullable: true, description: 'R2 上の画像のキー。/uploads/{key} で配信される')]
        public ?string $imageKey,
        public int $replyCount,
        public int $reactionCount,
        /** @var list<ReactionCount> */
        #[OA\Property(type: 'array', items: new OA\Items(ref: new Model(type: ReactionCount::class)))]
        public array $reactions,
        /** @var list<TagSummary> */
        #[OA\Property(type: 'array', items: new OA\Items(ref: new Model(type: TagSummary::class)))]
        public array $tags,
        #[OA\Property(format: 'date-time', nullable: true)]
        public ?string $lastReplyAt,
        #[OA\Property(format: 'date-time', nullable: true, description: '編集されていれば日時（「編集済み」表示に使う）')]
        public ?string $editedAt,
        #[OA\Property(format: 'date-time')]
        public string $createdAt,
    ) {
    }
}
