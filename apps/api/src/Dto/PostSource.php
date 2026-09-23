<?php

declare(strict_types=1);

namespace App\Dto;

use OpenApi\Attributes as OA;

/** 編集用の Markdown 原文。公開 API は HTML しか返さないので、本人にだけこれを返す。 */
final readonly class PostSource
{
    public function __construct(
        #[OA\Property(description: 'Markdown 原文')]
        public string $bodyMarkdown,
    ) {
    }
}
