<?php

declare(strict_types=1);

namespace App\Exception;

class SlugAlreadyUsedException extends \DomainException
{
    public function __construct(public readonly string $slug)
    {
        parent::__construct(sprintf('slug "%s" は既に使われています。', $slug));
    }
}
