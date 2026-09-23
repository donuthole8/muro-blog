<?php

declare(strict_types=1);

namespace App\Dto;

use Nelmio\ApiDocBundle\Attribute\Model;
use OpenApi\Attributes as OA;

final readonly class OrgRooms
{
    /**
     * @param list<RoomSummary> $rooms
     */
    public function __construct(
        public string $slug,
        #[OA\Property(description: '表示用の会社名（いちばん多い表記）')]
        public string $name,
        /** @var list<RoomSummary> */
        #[OA\Property(type: 'array', items: new OA\Items(ref: new Model(type: RoomSummary::class)))]
        public array $rooms,
    ) {
    }
}
