<?php

declare(strict_types=1);

namespace App\Service;

/**
 * 自己申告の会社名を /org/:slug の突き合わせ用に正規化する。
 *
 * 「株式会社サンプル」「（株）サンプル」「サンプル Inc.」を同じ会社として束ねたい。
 * 日本語の社名は英字の slug に機械的に変換できないので、slug も日本語のまま持つ
 * （URL ではパーセントエンコードされる）。
 */
final class CompanyNormalizer
{
    private const AFFIXES = [
        '株式会社', '有限会社', '合同会社', '合資会社', '合名会社', '一般社団法人', '一般財団法人',
        '(株)', '（株）', '㈱', '(有)', '（有）', '㈲', '(同)', '（同）',
        'inc.', 'inc', 'co., ltd.', 'co.,ltd.', 'co., ltd', 'co.,ltd', 'co. ltd.', 'co ltd', 'ltd.', 'ltd',
        'llc', 'l.l.c.', 'corp.', 'corp', 'corporation', 'k.k.', 'gmbh',
    ];

    public function slugify(string $name): ?string
    {
        $s = \Normalizer::normalize($name, \Normalizer::FORM_KC) ?: $name;
        $s = mb_strtolower($s);

        foreach (self::AFFIXES as $affix) {
            $affix = mb_strtolower(\Normalizer::normalize($affix, \Normalizer::FORM_KC) ?: $affix);
            // 英字の接尾辞は単語の一部（Lincoln の inc など）を消さないよう単語境界で見る。
            // 日本語は単語の区切りがないので、どこにあっても落とす。
            $s = 1 === preg_match('/^[\x20-\x7e]+$/', $affix)
                ? preg_replace('/(?<![a-z0-9])'.preg_quote($affix, '/').'(?![a-z0-9])/u', ' ', $s) ?? $s
                : str_replace($affix, ' ', $s);
        }

        // 記号・空白を落とす（「サンプル・テック」と「サンプルテック」を同じにする）
        $s = preg_replace('/[\s\p{P}\p{S}]+/u', '', $s) ?? '';

        return '' === $s ? null : mb_substr($s, 0, 100);
    }
}
