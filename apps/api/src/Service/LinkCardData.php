<?php

declare(strict_types=1);

namespace App\Service;

/**
 * 1 URL 分の OGP メタデータ。LinkCardFetcher の戻り値。
 */
final readonly class LinkCardData
{
    public function __construct(
        public string $url,
        public string $title,
        public ?string $description,
        public ?string $image,
        public string $siteName,
        public ?string $favicon,
    ) {
    }
}
