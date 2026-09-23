<?php

declare(strict_types=1);

namespace App\Service;

use Psr\Log\LoggerInterface;
use Symfony\Contracts\Cache\CacheInterface;
use Symfony\Contracts\Cache\ItemInterface;
use Symfony\Contracts\HttpClient\HttpClientInterface;
use Symfony\Contracts\HttpClient\ResponseInterface;

/**
 * 本文中の裸 URL から OGP メタデータを取ってきて、リンクカード（はてなブログの
 * 埋め込みカード相当）用のデータにする。
 *
 * 記事を書けるのは管理者本人だけだが、貼った URL の先は他人のサーバーなので
 * 失敗は常に起こりうる前提で作る： タイムアウト・非 HTML・パース失敗は
 * 例外を投げずに null を返し、呼び出し側（MarkdownRenderer）は
 * 元の裸リンクの見た目にフォールバックする。
 */
final class LinkCardFetcher
{
    private const TIMEOUT_SECONDS = 4.0;
    private const MAX_BODY_BYTES = 512 * 1024;
    private const CACHE_TTL_SECONDS = 60 * 60 * 24 * 7;

    public function __construct(
        private readonly HttpClientInterface $httpClient,
        private readonly CacheInterface $cache,
        private readonly LoggerInterface $logger,
    ) {
    }

    public function fetch(string $url): ?LinkCardData
    {
        if (!$this->isFetchable($url)) {
            return null;
        }

        $cacheKey = 'link_card.'.sha1($url);

        return $this->cache->get(
            $cacheKey,
            function (ItemInterface $item) use ($url): ?LinkCardData {
                $item->expiresAfter(self::CACHE_TTL_SECONDS);

                return $this->doFetch($url);
            },
        );
    }

    private function doFetch(string $url): ?LinkCardData
    {
        try {
            $response = $this->httpClient->request('GET', $url, [
                'timeout' => self::TIMEOUT_SECONDS,
                'max_redirects' => 3,
                'headers' => [
                    'User-Agent' => 'Mozilla/5.0 (compatible; blog-link-card/1.0; +link preview bot)',
                    'Accept' => 'text/html',
                ],
            ]);

            $contentType = $response->getHeaders(false)['content-type'][0] ?? '';
            if (!str_contains($contentType, 'text/html')) {
                return null;
            }

            $html = $this->readLimited($response);
        } catch (\Throwable $e) {
            $this->logger->info('link card fetch failed', [
                'url' => $url,
                'error' => $e->getMessage(),
            ]);

            return null;
        }

        return $this->parse($html, $url);
    }

    private function readLimited(ResponseInterface $response): string
    {
        $buffer = '';

        foreach ($this->httpClient->stream($response, self::TIMEOUT_SECONDS) as $chunk) {
            $buffer .= $chunk->getContent();

            if (strlen($buffer) >= self::MAX_BODY_BYTES) {
                break;
            }
        }

        return $buffer;
    }

    private function parse(string $html, string $url): ?LinkCardData
    {
        if (trim($html) === '') {
            return null;
        }

        $doc = new \DOMDocument();
        libxml_use_internal_errors(true);
        $doc->loadHTML('<?xml encoding="utf-8"?>'.$html, LIBXML_NOWARNING | LIBXML_NOERROR);
        libxml_clear_errors();

        $xpath = new \DOMXPath($doc);

        $title = $this->metaProperty($xpath, 'og:title') ?? $this->titleTag($xpath);
        if ($title === null || trim($title) === '') {
            // タイトルが取れないページはカード化する価値が薄いので諦める
            return null;
        }

        $description = $this->metaProperty($xpath, 'og:description') ?? $this->metaName($xpath, 'description');
        $image = $this->metaProperty($xpath, 'og:image');
        $siteName = $this->metaProperty($xpath, 'og:site_name');
        $host = parse_url($url, PHP_URL_HOST) ?: $url;

        return new LinkCardData(
            url: $url,
            title: trim($title),
            description: $description !== null && trim($description) !== '' ? trim($description) : null,
            image: $image !== null ? $this->resolveUrl($image, $url) : null,
            siteName: $siteName !== null && trim($siteName) !== '' ? trim($siteName) : $host,
            favicon: $this->resolveUrl('/favicon.ico', $url),
        );
    }

    private function metaProperty(\DOMXPath $xpath, string $property): ?string
    {
        $node = $xpath->query(sprintf('//meta[@property="%s"]/@content', $property))->item(0);

        return $node?->nodeValue;
    }

    private function metaName(\DOMXPath $xpath, string $name): ?string
    {
        $node = $xpath->query(sprintf('//meta[@name="%s"]/@content', $name))->item(0);

        return $node?->nodeValue;
    }

    private function titleTag(\DOMXPath $xpath): ?string
    {
        $node = $xpath->query('//title')->item(0);

        return $node?->textContent;
    }

    private function resolveUrl(string $maybeRelative, string $baseUrl): ?string
    {
        if (parse_url($maybeRelative, PHP_URL_SCHEME) !== null) {
            return $maybeRelative;
        }

        $base = parse_url($baseUrl);
        if (!isset($base['scheme'], $base['host'])) {
            return null;
        }

        $origin = $base['scheme'].'://'.$base['host'].(isset($base['port']) ? ':'.$base['port'] : '');

        if (str_starts_with($maybeRelative, '//')) {
            return $base['scheme'].':'.$maybeRelative;
        }

        if (str_starts_with($maybeRelative, '/')) {
            return $origin.$maybeRelative;
        }

        return $origin.'/'.$maybeRelative;
    }

    /**
     * http(s) の公開 URL だけを許可する。
     * 管理者しか本文を書けないとはいえ、サーバーからの outbound fetch が
     * 社内ネットワークやクラウドのメタデータエンドポイントに向かないよう、
     * ループバック・プライベート・リンクローカルなアドレスは弾く。
     */
    private function isFetchable(string $url): bool
    {
        $parts = parse_url($url);
        if (!isset($parts['scheme'], $parts['host']) || !in_array($parts['scheme'], ['http', 'https'], true)) {
            return false;
        }

        $host = $parts['host'];
        $ip = filter_var($host, FILTER_VALIDATE_IP) ? $host : gethostbyname($host);

        if ($ip === $host && !filter_var($host, FILTER_VALIDATE_IP)) {
            // gethostbyname は解決できないとき引数をそのまま返す
            return false;
        }

        return filter_var(
            $ip,
            FILTER_VALIDATE_IP,
            FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE,
        ) !== false;
    }
}
