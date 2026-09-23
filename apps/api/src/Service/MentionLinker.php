<?php

declare(strict_types=1);

namespace App\Service;

use League\CommonMark\Extension\Mention\Generator\MentionGeneratorInterface;
use League\CommonMark\Extension\Mention\Mention;
use League\CommonMark\Node\Inline\AbstractInline;

/**
 * 本文中の @handle を部屋へのリンクにする。実在するユーザーだけをリンクにし、
 * リンクにした handle を控えておく（メンション通知の宛先になる）。
 *
 * 変換のたびに PostBodyRenderer が reset() で候補を差し替える。
 */
final class MentionLinker implements MentionGeneratorInterface
{
    /** @var array<string, true> */
    private array $known = [];

    /** @var array<string, true> */
    private array $linked = [];

    /** @param list<string> $knownHandles */
    public function reset(array $knownHandles): void
    {
        $this->known = array_fill_keys($knownHandles, true);
        $this->linked = [];
    }

    public function generateMention(Mention $mention): ?AbstractInline
    {
        $handle = strtolower($mention->getIdentifier());
        if (!isset($this->known[$handle])) {
            return null;
        }

        $this->linked[$handle] = true;
        $mention->setUrl('/@'.$handle);
        $mention->data->append('attributes/class', 'mention');

        return $mention;
    }

    /** @return list<string> */
    public function linkedHandles(): array
    {
        return array_keys($this->linked);
    }
}
