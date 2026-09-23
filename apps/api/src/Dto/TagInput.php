<?php

declare(strict_types=1);

namespace App\Dto;

use OpenApi\Attributes as OA;
use Symfony\Component\Validator\Constraints as Assert;

final class TagInput
{
    /** 表示名。日本語も使える。 */
    #[Assert\NotBlank(message: 'タグ名は必須です。')]
    #[Assert\Length(max: 64)]
    #[OA\Property(example: 'JavaScript')]
    public string $name = '';

    /** URL に使う識別子。日本語名から機械的に導出できないため明示的に指定する。 */
    #[Assert\NotBlank(message: 'slug は必須です。')]
    #[Assert\Length(max: 64)]
    #[Assert\Regex('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', message: 'slug は英小文字・数字・ハイフンのみ使用できます。')]
    #[OA\Property(example: 'javascript')]
    public string $slug = '';
}
