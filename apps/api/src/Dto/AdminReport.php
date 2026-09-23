<?php

declare(strict_types=1);

namespace App\Dto;

use Nelmio\ApiDocBundle\Attribute\Model;
use OpenApi\Attributes as OA;

/** 管理画面に出す通報。 */
final readonly class AdminReport
{
    public function __construct(
        public string $id,
        #[OA\Property(ref: new Model(type: AdminPost::class))]
        public AdminPost $post,
        #[OA\Property(description: '投稿の状態', enum: ['visible', 'hidden', 'deleted'])]
        public string $postState,
        #[OA\Property(ref: new Model(type: AdminUser::class))]
        public AdminUser $reporter,
        #[OA\Property(enum: ['spam', 'harassment', 'privacy', 'illegal', 'other'])]
        public string $reason,
        #[OA\Property(nullable: true)]
        public ?string $detail,
        #[OA\Property(nullable: true, enum: ['actioned', 'dismissed'])]
        public ?string $resolution,
        #[OA\Property(nullable: true)]
        public ?string $resolvedAt,
        public string $createdAt,
    ) {
    }
}
