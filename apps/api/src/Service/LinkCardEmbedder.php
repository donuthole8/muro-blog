<?php

declare(strict_types=1);

namespace App\Service;

/**
 * 独立行に貼っただけの裸 URL を、OGP 情報つきのリンクカードに差し替える。
 * アーカイブ記事（MarkdownRenderer）と times の投稿（PostBodyRenderer）で共用する。
 */
final class LinkCardEmbedder
{
    public function __construct(
        private readonly LinkCardFetcher $linkCards,
    ) {
    }

    /** 裸リンクを含むか。含まなければカードを埋める処理（外部への通信）自体が要らない。 */
    public function hasBareLink(string $html): bool
    {
        return str_contains($html, '<a ') && 1 === preg_match('#<p><a [^>]*href="([^"]+)"[^>]*>\1/?</a></p>#', $html);
    }

    /**
     * 独立行に貼っただけの裸 URL（Markdown の自動リンク＝
     * `<p><a href="X">X</a></p>`）を OGP 情報つきのリンクカードに差し替える。
     * URL の取得に失敗したものはそのまま裸リンクとして残す
     * （フロント側の CSS がカード風の見た目にフォールバックする）。
     */
    public function embed(string $html): string
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
        // 外部サイトへのカード。times の投稿は第三者が書くので、評価を渡さず別タブで開く
        $a->setAttribute('rel', 'nofollow ugc noopener noreferrer');
        $a->setAttribute('target', '_blank');

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
}
