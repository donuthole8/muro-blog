<?php

declare(strict_types=1);

namespace App\Dto;

use OpenApi\Attributes as OA;
use Symfony\Component\Validator\Constraints as Assert;

final class MarkdownPreviewInput
{
    #[Assert\Length(max: 200000)]
    #[OA\Property(description: 'プレビューしたい Markdown 原文', example: "# 見出し\n\n本文。")]
    public string $bodyMd = '';
}
