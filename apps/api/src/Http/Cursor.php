<?php

declare(strict_types=1);

namespace App\Http;

use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;
use Symfony\Component\Uid\Ulid;

/** ?cursor= の値（直前のページの最後の ID）を解釈する。 */
final class Cursor
{
    public const PAGE_SIZE = 20;

    public static function parse(?string $cursor): ?Ulid
    {
        if (null === $cursor || '' === $cursor) {
            return null;
        }

        if (!Ulid::isValid($cursor)) {
            throw new BadRequestHttpException('cursor が不正です。');
        }

        return Ulid::fromString($cursor);
    }
}
