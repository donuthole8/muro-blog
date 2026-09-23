<?php

declare(strict_types=1);

namespace App\Dto;

use Nelmio\ApiDocBundle\Attribute\Model;
use OpenApi\Attributes as OA;

final readonly class NotificationPage
{
    /**
     * @param list<NotificationItem> $items
     */
    public function __construct(
        /** @var list<NotificationItem> */
        #[OA\Property(type: 'array', items: new OA\Items(ref: new Model(type: NotificationItem::class)))]
        public array $items,
        #[OA\Property(nullable: true)]
        public ?string $nextCursor,
        public int $unreadCount,
    ) {
    }
}
