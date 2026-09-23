<?php

declare(strict_types=1);

namespace App\Enum;

/** 通報の理由。 */
enum ReportReason: string
{
    case Spam = 'spam';
    case Harassment = 'harassment';
    case Privacy = 'privacy';
    case Illegal = 'illegal';
    case Other = 'other';
}
