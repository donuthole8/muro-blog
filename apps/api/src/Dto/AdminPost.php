<?php

declare(strict_types=1);

namespace App\Dto;

use Nelmio\ApiDocBundle\Attribute\Model;
use OpenApi\Attributes as OA;

/** 管理画面用。非表示の投稿も本文ごと見える。 */
final readonly class AdminPost
{
    public function __construct(
        public string $id,
        #[OA\Property(nullable: true)]
        public ?string $parentId,
        #[OA\Property(ref: new Model(type: AdminUser::class))]
        public AdminUser $author,
        public string $bodyMarkdown,
        #[OA\Property(nullable: true)]
        public ?string $imageKey,
        #[OA\Property(format: 'date-time', nullable: true)]
        public ?string $hiddenAt,
        #[OA\Property(format: 'date-time')]
        public string $createdAt,
    ) {
    }
}
