<?php

declare(strict_types=1);

namespace App\Dto;

use OpenApi\Attributes as OA;

final readonly class MarkdownPreview
{
    public function __construct(
        #[OA\Property(description: '変換後の HTML')]
        public string $bodyHtml,
        #[OA\Property(description: '本文から自動生成した抜粋')]
        public string $excerpt,
    ) {
    }
}
