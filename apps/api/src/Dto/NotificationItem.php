<?php

declare(strict_types=1);

namespace App\Dto;

use Nelmio\ApiDocBundle\Attribute\Model;
use OpenApi\Attributes as OA;

final readonly class NotificationItem
{
    public function __construct(
        public string $id,
        #[OA\Property(enum: ['reply', 'mention', 'reaction', 'follow'])]
        public string $type,
        #[OA\Property(nullable: true, ref: new Model(type: UserSummary::class))]
        public ?UserSummary $actor,
        #[OA\Property(nullable: true, description: '通知の対象になった投稿（follow では null）')]
        public ?string $postId,
        #[OA\Property(nullable: true, description: 'リンク先のスレッド（親投稿）の ID（follow では null）')]
        public ?string $threadId,
        #[OA\Property(nullable: true, description: 'スレッドの持ち主の handle。/@{handle}/{threadId} に飛ばす')]
        public ?string $threadHandle,
        #[OA\Property(description: '投稿の冒頭（プレーンテキスト）。follow では空文字')]
        public string $excerpt,
        #[OA\Property(format: 'date-time', nullable: true)]
        public ?string $readAt,
        #[OA\Property(format: 'date-time')]
        public string $createdAt,
    ) {
    }
}
