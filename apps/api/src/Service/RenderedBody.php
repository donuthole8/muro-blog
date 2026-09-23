<?php

declare(strict_types=1);

namespace App\Service;

final readonly class RenderedBody
{
    /**
     * @param list<string> $mentionedHandles 本文でリンクになった @handle
     */
    public function __construct(
        public string $html,
        public array $mentionedHandles,
    ) {
    }
}
