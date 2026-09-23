<?php

declare(strict_types=1);

namespace App\Dto;

use Nelmio\ApiDocBundle\Attribute\Model;
use OpenApi\Attributes as OA;

final readonly class AdminReportPage
{
    /**
     * @param list<AdminReport> $items
     */
    public function __construct(
        /** @var list<AdminReport> */
        #[OA\Property(type: 'array', items: new OA\Items(ref: new Model(type: AdminReport::class)))]
        public array $items,
        #[OA\Property(nullable: true)]
        public ?string $nextCursor,
        #[OA\Property(description: '未対応の通報の総数')]
        public int $openCount,
    ) {
    }
}
