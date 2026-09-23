<?php

declare(strict_types=1);

namespace App\Enum;

/** レート制限をかける書き込み操作。値は config/packages/rate_limiter.yaml の limiter 名。 */
enum RateLimitedAction: string
{
    case Post = 'post';
    case ImageUpload = 'image_upload';
    case Reaction = 'reaction';
    case Report = 'report';

    public function label(): string
    {
        return match ($this) {
            self::Post => '投稿',
            self::ImageUpload => '画像のアップロード',
            self::Reaction => 'リアクション',
            self::Report => '通報',
        };
    }
}
