<?php

declare(strict_types=1);

namespace App\Enum;

enum NotificationType: string
{
    /** 自分の親投稿のスレッドに誰かが返信した */
    case Reply = 'reply';
    /** 本文で @handle と呼ばれた */
    case Mention = 'mention';
    /** 自分の投稿にリアクションが付いた */
    case Reaction = 'reaction';
}
