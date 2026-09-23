<?php

declare(strict_types=1);

namespace App\Dto;

use Nelmio\ApiDocBundle\Attribute\Model;
use OpenApi\Attributes as OA;

/** 部屋の一覧（人気の部屋・会社・フォロー中）の1行。 */
final readonly class RoomSummary
{
    public function __construct(
        #[OA\Property(ref: new Model(type: UserSummary::class))]
        public UserSummary $user,
        #[OA\Property(nullable: true)]
        public ?string $bio,
        #[OA\Property(nullable: true)]
        public ?string $companyName,
        #[OA\Property(format: 'date-time', nullable: true, description: '最新の親投稿の日時')]
        public ?string $lastPostAt,
        #[OA\Property(nullable: true, description: '人気の部屋: 過去24時間のリアクション数＋返信数 / フォロー中: 未読数')]
        public ?int $count,
    ) {
    }
}
