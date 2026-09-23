<?php

declare(strict_types=1);

namespace App\Dto;

use Nelmio\ApiDocBundle\Attribute\Model;
use OpenApi\Attributes as OA;

final readonly class Thread
{
    /**
     * @param list<TimesPost> $replies
     */
    public function __construct(
        #[OA\Property(ref: new Model(type: TimesPost::class))]
        public TimesPost $post,
        /** @var list<TimesPost> */
        #[OA\Property(type: 'array', description: '古い順', items: new OA\Items(ref: new Model(type: TimesPost::class)))]
        public array $replies,
    ) {
    }
}
