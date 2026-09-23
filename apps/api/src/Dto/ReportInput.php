<?php

declare(strict_types=1);

namespace App\Dto;

use App\Enum\ReportReason;
use OpenApi\Attributes as OA;
use Symfony\Component\Validator\Constraints as Assert;

/** 投稿の通報。 */
final class ReportInput
{
    #[OA\Property(description: 'spam: スパム / harassment: 嫌がらせ・誹謗中傷 / privacy: 個人情報 / illegal: 違法な内容 / other: その他')]
    public ReportReason $reason = ReportReason::Other;

    #[Assert\Length(max: 500, maxMessage: '詳細は {{ limit }} 文字までです。')]
    #[OA\Property(nullable: true, description: '詳細（任意）')]
    public ?string $detail = null;
}
