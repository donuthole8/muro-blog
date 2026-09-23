<?php

declare(strict_types=1);

namespace App\Service;

use League\CommonMark\Environment\Environment;
use League\CommonMark\Extension\CommonMark\CommonMarkCoreExtension;
use League\CommonMark\Extension\GithubFlavoredMarkdownExtension;
use League\CommonMark\Extension\HeadingPermalink\HeadingPermalinkExtension;
use League\CommonMark\MarkdownConverter;

/**
 * アーカイブ記事（旧ブログ）の Markdown を HTML へ変換する。
 * times の投稿は第三者が書くので、生 HTML を通さない PostBodyRenderer を使うこと。
 *
 * 表示側（フロントエンド）は変換済みの HTML を受け取るだけなので、
 * 変換ロジックはこのクラスに閉じる。
 */
final class MarkdownRenderer
{
    private readonly MarkdownConverter $converter;

    public function __construct(
        private readonly LinkCardEmbedder $linkCards,
    ) {
        $environment = new Environment([
            // 記事を書くのは管理者本人のみ。生 HTML の埋め込みを許可する。
            // 第三者が投稿できる設計に変える場合は 'strip' に変更すること。
            'html_input' => 'allow',
            'allow_unsafe_links' => false,
            'max_nesting_level' => 100,
        ]);
        $environment->addExtension(new CommonMarkCoreExtension());
        $environment->addExtension(new GithubFlavoredMarkdownExtension());
        // 見出しに id を振る（目次で使う）。アンカー記号は挿入せず id だけ付与する
        $environment->addExtension(new HeadingPermalinkExtension());
        $environment->mergeConfig([
            'heading_permalink' => [
                'html_class' => '',
                'id_prefix' => '',
                'apply_id_to_heading' => true,
                'insert' => 'none',
            ],
        ]);

        $this->converter = new MarkdownConverter($environment);
    }

    public function toHtml(string $markdown): string
    {
        $html = $this->converter->convert($markdown)->getContent();

        return $this->linkCards->embed($html);
    }

    /**
     * 一覧・OGP 用の抜粋を本文から作る。
     * Markdown 記法・コードブロック・見出しを落としたうえで切り詰める。
     */
    public function toExcerpt(string $markdown, int $length = 120): string
    {
        // コードブロックは抜粋にすると意味をなさないので先に除去する
        $text = preg_replace('/```.*?```/s', '', $markdown) ?? $markdown;
        // HTML に変換してからタグを落とすことで、記法の取りこぼしを防ぐ
        $text = strip_tags($this->toHtml($text));
        $text = trim(preg_replace('/\s+/u', ' ', $text) ?? $text);

        if (mb_strlen($text) <= $length) {
            return $text;
        }

        return mb_substr($text, 0, $length).'…';
    }
}
