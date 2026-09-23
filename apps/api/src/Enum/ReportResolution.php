<?php

declare(strict_types=1);

namespace App\Enum;

/** 管理者による通報への対応。 */
enum ReportResolution: string
{
    /** 投稿を非表示・削除した */
    case Actioned = 'actioned';
    /** 問題なしとして却下した */
    case Dismissed = 'dismissed';
}
