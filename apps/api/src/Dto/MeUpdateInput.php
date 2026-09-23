<?php

declare(strict_types=1);

namespace App\Dto;

use OpenApi\Attributes as OA;
use Symfony\Component\Validator\Constraints as Assert;

/**
 * プロフィールの更新。handle は初回（未決定のとき）だけ設定でき、以後は変えられない
 * （部屋の URL と他人の本文中のメンションが壊れるため）。
 */
final class MeUpdateInput
{
    #[OA\Property(nullable: true, description: '初回のみ。英小文字・数字・_ の 3〜20 文字', example: 'alice')]
    public ?string $handle = null;

    #[Assert\NotBlank(message: '表示名は必須です。')]
    #[Assert\Length(max: 50)]
    public string $displayName = '';

    #[Assert\Length(max: 300)]
    #[OA\Property(nullable: true)]
    public ?string $bio = null;

    #[Assert\Length(max: 100)]
    #[OA\Property(nullable: true, description: '自己申告の所属。空なら未設定')]
    public ?string $companyName = null;
}
