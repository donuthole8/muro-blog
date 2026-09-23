<?php

declare(strict_types=1);

namespace App\Dto;

use Nelmio\ApiDocBundle\Attribute\Model;
use OpenApi\Attributes as OA;

/** ブロック中のユーザー（設定画面の一覧用）。 */
final readonly class BlockedUser
{
    public function __construct(
        #[OA\Property(ref: new Model(type: UserSummary::class))]
        public UserSummary $user,
        public string $blockedAt,
    ) {
    }
}
