<?php

declare(strict_types=1);

namespace App\Dto;

use OpenApi\Attributes as OA;

/**
 * 画像アップロードの許可。Worker はこれを受け取ってから R2 に置く。
 * userId は画像キーの先頭に埋め込む（投稿時に本人のアップロードか照合するため）。
 */
final readonly class UploadTicket
{
    public function __construct(
        #[OA\Property(description: 'アップロードする本人の ID（ULID）')]
        public string $userId,
    ) {
    }
}
