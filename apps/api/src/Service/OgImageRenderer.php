<?php

declare(strict_types=1);

namespace App\Service;

use Symfony\Component\DependencyInjection\Attribute\Autowire;

/**
 * 部屋とスレッドの共有カード（OGP 画像, 1200×630 の PNG）を GD で描く。
 *
 * Worker（無料枠は CPU 10ms・バンドル 3MB）では日本語フォント込みの画像生成が
 * 収まらないため、Cloud Run 側で描き、Worker のエッジで長めにキャッシュする。
 * フォントは Noto Sans JP（OFL）。リポジトリには入れず bin/fetch-fonts.sh で取得する。
 */
final readonly class OgImageRenderer
{
    public const WIDTH = 1200;
    public const HEIGHT = 630;

    private const PADDING = 80;

    // web の lib/roomColor.ts と同じ計算で、部屋ごとの色相を決める
    private const HUE_START = 190;
    private const HUE_RANGE = 120;

    public function __construct(
        #[Autowire('%kernel.project_dir%/resources/fonts')]
        private string $fontDir,
        /** カード右下に出すサービス名。web の lib/site.ts の title と揃える */
        #[Autowire(env: 'default:default_site_name:SITE_NAME')]
        private string $siteName = 'teatimes',
    ) {
    }

    public function isAvailable(): bool
    {
        return is_file($this->font('Bold')) && is_file($this->font('Regular'));
    }

    /** 部屋のカード: 表示名・handle・自己紹介。 */
    public function room(string $handle, string $displayName, ?string $bio, int $followerCount): string
    {
        $image = $this->canvas($handle);
        $white = $this->color($image, 255, 255, 255);
        $muted = $this->color($image, 255, 255, 255, 40);

        $this->avatar($image, $displayName, self::PADDING, 110, 140);
        $this->lines($image, [self::clip($displayName, 1)[0] ?? ''], 'Bold', 60, $white, 250, 175, self::WIDTH - 250 - self::PADDING, 1);
        $this->text($image, '@'.$handle, 'Regular', 32, $muted, 250, 235);

        if (null !== $bio && '' !== trim($bio)) {
            $this->lines($image, [trim($bio)], 'Regular', 36, $white, self::PADDING, 350, self::WIDTH - self::PADDING * 2, 3, 56);
        }

        $this->footer($image, sprintf('@%s の times　フォロワー %d', $handle, $followerCount));

        return $this->png($image);
    }

    /** スレッドのカード: 投稿者と本文の冒頭。 */
    public function thread(string $handle, string $displayName, string $excerpt, int $replyCount): string
    {
        $image = $this->canvas($handle);
        $white = $this->color($image, 255, 255, 255);
        $muted = $this->color($image, 255, 255, 255, 40);

        $this->avatar($image, $displayName, self::PADDING, 72, 88);
        $this->lines($image, [$displayName], 'Bold', 36, $white, 190, 115, self::WIDTH - 190 - self::PADDING, 1);
        $this->text($image, '@'.$handle, 'Regular', 26, $muted, 190, 155);

        $body = '' === trim($excerpt) ? '（画像の投稿）' : $excerpt;
        $this->lines($image, [$body], 'Bold', 48, $white, self::PADDING, 275, self::WIDTH - self::PADDING * 2, 4, 74);

        $this->footer($image, $replyCount > 0 ? sprintf('返信 %d 件', $replyCount) : '@'.$handle.' の times');

        return $this->png($image);
    }

    /** @return \GdImage */
    private function canvas(string $handle): \GdImage
    {
        $image = imagecreatetruecolor(self::WIDTH, self::HEIGHT);
        imagealphablending($image, true);
        imageantialias($image, true);

        // 左上から右下への斜めのグラデーション。部屋の色相で、暗→明
        $hue = self::roomHue($handle);
        [$r1, $g1, $b1] = self::hsl($hue, 0.55, 0.20);
        [$r2, $g2, $b2] = self::hsl($hue, 0.65, 0.48);
        $span = self::WIDTH + self::HEIGHT;
        for ($x = 0; $x < $span; $x += 2) {
            $t = $x / $span;
            $c = imagecolorallocate(
                $image,
                (int) ($r1 + ($r2 - $r1) * $t),
                (int) ($g1 + ($g2 - $g1) * $t),
                (int) ($b1 + ($b2 - $b1) * $t),
            );
            // x + y = 一定 の斜線を2本ずつ引いて塗りつぶす
            imageline($image, $x, 0, $x - self::HEIGHT, self::HEIGHT, (int) $c);
            imageline($image, $x + 1, 0, $x + 1 - self::HEIGHT, self::HEIGHT, (int) $c);
        }

        return $image;
    }

    /** 頭文字を丸の中に描く（外部の画像は取りに行かない。遅くなり、失敗もしうるため）。 */
    private function avatar(\GdImage $image, string $name, int $x, int $y, int $size): void
    {
        $bg = $this->color($image, 255, 255, 255, 100);
        imagefilledellipse($image, $x + intdiv($size, 2), $y + intdiv($size, 2), $size, $size, $bg);

        $initial = mb_strtoupper(mb_substr(trim($name), 0, 1)) ?: '?';
        $fontSize = (int) ($size * 0.42);
        $box = imagettfbbox($fontSize, 0, $this->font('Bold'), $initial) ?: [0, 0, 0, 0, 0, 0, 0, 0];
        $w = $box[2] - $box[0];
        $h = $box[1] - $box[7];
        $this->text($image, $initial, 'Bold', $fontSize, $this->color($image, 255, 255, 255), $x + intdiv($size - $w, 2) - $box[0], $y + intdiv($size + $h, 2));
    }

    private function footer(\GdImage $image, string $left): void
    {
        $muted = $this->color($image, 255, 255, 255, 50);
        $this->text($image, $left, 'Regular', 26, $muted, self::PADDING, self::HEIGHT - 56);

        $brand = $this->siteName;
        $box = imagettfbbox(30, 0, $this->font('Bold'), $brand) ?: [0, 0, 0, 0, 0, 0, 0, 0];
        $this->text($image, $brand, 'Bold', 30, $this->color($image, 255, 255, 255, 30), self::WIDTH - self::PADDING - ($box[2] - $box[0]), self::HEIGHT - 56);
    }

    /**
     * 幅に収まるよう1文字ずつ詰めて折り返し、あふれたら最後の行を … で切る。
     *
     * @param list<string> $paragraphs
     */
    private function lines(\GdImage $image, array $paragraphs, string $weight, int $size, int $color, int $x, int $y, int $maxWidth, int $maxLines, ?int $lineHeight = null): void
    {
        $font = $this->font($weight);
        $lineHeight ??= (int) ($size * 1.5);
        $lines = [];
        $truncated = false;

        foreach ($paragraphs as $paragraph) {
            foreach (preg_split('/\R/u', $paragraph) ?: [] as $raw) {
                $current = '';
                // 英数字の単語は途中で折らない（1語で1行を超えるときだけ文字単位に割る）
                preg_match_all('/[A-Za-z0-9_\-.,:\/@#]+|./us', $raw, $m);
                foreach ($m[0] as $token) {
                    if ('' !== $current && $this->width($size, $font, $current.$token) > $maxWidth) {
                        $lines[] = rtrim($current);
                        $current = ltrim($token);
                    } else {
                        $current .= $token;
                    }
                    while ($this->width($size, $font, $current) > $maxWidth && mb_strlen($current) > 1) {
                        $cut = mb_strlen($current) - 1;
                        while ($cut > 1 && $this->width($size, $font, mb_substr($current, 0, $cut)) > $maxWidth) {
                            --$cut;
                        }
                        $lines[] = mb_substr($current, 0, $cut);
                        $current = mb_substr($current, $cut);
                    }
                }
                $lines[] = $current;
            }
        }

        $lines = array_values(array_filter($lines, static fn (string $l): bool => '' !== trim($l)));
        if (count($lines) > $maxLines) {
            $lines = array_slice($lines, 0, $maxLines);
            $truncated = true;
        }
        if ($truncated) {
            $last = array_key_last($lines);
            while ('' !== $lines[$last] && $this->width($size, $font, $lines[$last].'…') > $maxWidth) {
                $lines[$last] = mb_substr($lines[$last], 0, -1);
            }
            $lines[$last] .= '…';
        }

        foreach ($lines as $i => $line) {
            imagettftext($image, $size, 0, $x, $y + $i * $lineHeight, $color, $font, $line);
        }
    }

    private function text(\GdImage $image, string $text, string $weight, int $size, int $color, int $x, int $y): void
    {
        imagettftext($image, $size, 0, $x, $y, $color, $this->font($weight), $text);
    }

    private function width(int $size, string $font, string $text): int
    {
        $box = imagettfbbox($size, 0, $font, $text) ?: [0, 0, 0, 0];

        return $box[2] - $box[0];
    }

    /** @param int $alpha 0（不透明）〜127（透明） */
    private function color(\GdImage $image, int $r, int $g, int $b, int $alpha = 0): int
    {
        return (int) imagecolorallocatealpha($image, $r, $g, $b, $alpha);
    }

    private function png(\GdImage $image): string
    {
        ob_start();
        imagepng($image, null, 6);
        imagedestroy($image);

        return (string) ob_get_clean();
    }

    private function font(string $weight): string
    {
        return sprintf('%s/NotoSansJP-%s.otf', $this->fontDir, $weight);
    }

    /** @return list<string> */
    private static function clip(string $text, int $lines): array
    {
        return array_slice(preg_split('/\R/u', $text) ?: [], 0, $lines);
    }

    public static function roomHue(string $handle): int
    {
        $hash = 0;
        foreach (mb_str_split($handle) as $ch) {
            $hash = ($hash * 31 + mb_ord($ch)) % 3600000;
        }

        return self::HUE_START + ($hash % self::HUE_RANGE);
    }

    /** @return array{int, int, int} */
    private static function hsl(int $h, float $s, float $l): array
    {
        $c = (1 - abs(2 * $l - 1)) * $s;
        $x = $c * (1 - abs(fmod($h / 60, 2) - 1));
        $m = $l - $c / 2;
        [$r, $g, $b] = match (intdiv($h % 360, 60)) {
            0 => [$c, $x, 0],
            1 => [$x, $c, 0],
            2 => [0, $c, $x],
            3 => [0, $x, $c],
            4 => [$x, 0, $c],
            default => [$c, 0, $x],
        };

        return [(int) round(($r + $m) * 255), (int) round(($g + $m) * 255), (int) round(($b + $m) * 255)];
    }
}
