<?php

declare(strict_types=1);

namespace App\Exception;

class UnknownTagException extends \DomainException
{
    public function __construct(public readonly string $slug)
    {
        parent::__construct(sprintf('タグ "%s" は存在しません。先にタグを作成してください。', $slug));
    }
}
