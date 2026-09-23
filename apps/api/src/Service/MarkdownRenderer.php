<?php

declare(strict_types=1);

namespace App\Service;

use League\CommonMark\Environment\Environment;
use League\CommonMark\Extension\CommonMark\CommonMarkCoreExtension;
use League\CommonMark\Extension\GithubFlavoredMarkdownExtension;
use League\CommonMark\Extension\HeadingPermalink\HeadingPermalinkExtension;
use League\CommonMark\MarkdownConverter;

/**
 * 記事の Markdown を保存時に HTML へ変換する。
 *
 * 表示側（フロントエンド）は変換済みの HTML を受け取るだけなので、
 * 変換ロジックはこのクラスに閉じる。
 */
final class MarkdownRenderer
{
    private readonly MarkdownConverter $converter;

    public function __construct(
        private readonly LinkCardFetcher $linkCards,
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

        return $this->embedLinkCards($html);
    }

    /**
     * 独立行に貼っただけの裸 URL（Markdown の自動リンク＝
     * `<p><a href="X">X</a></p>`）を OGP 情報つきのリンクカードに差し替える。
     * URL の取得に失敗したものはそのまま裸リンクとして残す
     * （フロント側の CSS がカード風の見た目にフォールバックする）。
     */
    private function embedLinkCards(string $html): string
    {
        if (!str_contains($html, '<a ')) {
            return $html;
        }

        $doc = new \DOMDocument();
        libxml_use_internal_errors(true);
        $doc->loadHTML(
            '<?xml encoding="utf-8"?><div>'.$html.'</div>',
            LIBXML_NOWARNING | LIBXML_NOERROR,
        );
        libxml_clear_errors();

        $body = $doc->getElementsByTagName('body')->item(0);
        $root = $body?->firstChild;
        if (!$root instanceof \DOMElement) {
            return $html;
        }

        $targets = [];
        foreach ($root->childNodes as $node) {
            if ($node instanceof \DOMElement && $node->tagName === 'p' && $this->isBareLinkParagraph($node)) {
                $targets[] = $node;
            }
        }

        foreach ($targets as $p) {
            /** @var \DOMElement $anchor */
            $anchor = $p->firstChild;
            $card = $this->linkCards->fetch($anchor->getAttribute('href'));

            if ($card === null) {
                // OGP が取れなかった裸 URL。CSS 側は「p の唯一の子が a」という
                // 構造セレクタ(:only-child)だとテキストを無視して誤爆する
                // （例: 文中の [text](url) も拾ってしまう）ため、
                // ここで明示的にクラスを振って対象を確定させる。
                $anchor->setAttribute('class', trim($anchor->getAttribute('class').' bare-link'));

                continue;
            }

            $p->parentNode?->replaceChild($this->renderLinkCard($doc, $card), $p);
        }

        $innerHtml = '';
        foreach ($root->childNodes as $child) {
            $innerHtml .= $doc->saveHTML($child);
        }

        return $innerHtml;
    }

    private function isBareLinkParagraph(\DOMElement $p): bool
    {
        if ($p->childNodes->length !== 1) {
            return false;
        }

        $child = $p->firstChild;
        if (!$child instanceof \DOMElement || $child->tagName !== 'a') {
            return false;
        }

        $href = $child->getAttribute('href');
        $text = trim($child->textContent);

        return $href !== '' && ($text === $href || $text === rtrim($href, '/'));
    }

    private function renderLinkCard(\DOMDocument $doc, LinkCardData $card): \DOMElement
    {
        $a = $doc->createElement('a');
        $a->setAttribute('href', $card->url);
        $a->setAttribute('class', 'link-card');

        $body = $doc->createElement('span');
        $body->setAttribute('class', 'link-card-body');

        $title = $doc->createElement('span');
        $title->setAttribute('class', 'link-card-title');
        $title->appendChild($doc->createTextNode($card->title));
        $body->appendChild($title);

        if ($card->description !== null) {
            $desc = $doc->createElement('span');
            $desc->setAttribute('class', 'link-card-desc');
            $desc->appendChild($doc->createTextNode($card->description));
            $body->appendChild($desc);
        }

        $meta = $doc->createElement('span');
        $meta->setAttribute('class', 'link-card-meta');

        if ($card->favicon !== null) {
            $favicon = $doc->createElement('img');
            $favicon->setAttribute('src', $card->favicon);
            $favicon->setAttribute('alt', '');
            $favicon->setAttribute('loading', 'lazy');
            $favicon->setAttribute('class', 'link-card-favicon');
            $favicon->setAttribute('onerror', "this.style.display='none'");
            $meta->appendChild($favicon);
        }

        $domain = $doc->createElement('span');
        $domain->setAttribute('class', 'link-card-domain');
        $domain->appendChild($doc->createTextNode($card->siteName));
        $meta->appendChild($domain);

        $body->appendChild($meta);
        $a->appendChild($body);

        if ($card->image !== null) {
            $thumb = $doc->createElement('img');
            $thumb->setAttribute('src', $card->image);
            $thumb->setAttribute('alt', '');
            $thumb->setAttribute('loading', 'lazy');
            $thumb->setAttribute('class', 'link-card-thumb');
            $thumb->setAttribute('onerror', "this.style.display='none'");
            $a->appendChild($thumb);
        }

        return $a;
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
