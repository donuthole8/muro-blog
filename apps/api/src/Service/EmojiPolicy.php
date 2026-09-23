<?php

declare(strict_types=1);

namespace App\Service;

/**
 * リアクションに使える絵文字か。1書記素（肌色・ZWJ 合成を含む）の絵文字1つだけを許す。
 * 任意の文字列を通すと、リアクション欄が自由記述の掲示板になってしまうため。
 */
final class EmojiPolicy
{
    public static function isValid(string $emoji): bool
    {
        if ('' === $emoji || strlen($emoji) > 32 || 1 !== grapheme_strlen($emoji)) {
            return false;
        }

        // 国旗（地域指示子2つ）と、絵文字として描かれる記号（Extended_Pictographic）で始まるもの。
        // 数字や # もキーキャップの素として Emoji プロパティを持つので、そちらは見ない。
        return 1 === preg_match('/^(?:\p{Extended_Pictographic}|[\x{1F1E6}-\x{1F1FF}]{2})/u', $emoji);
    }
}
