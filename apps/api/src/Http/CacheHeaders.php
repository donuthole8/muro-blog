<?php

declare(strict_types=1);

namespace App\Http;

use Symfony\Component\HttpFoundation\Response;

/**
 * 公開 GET のキャッシュ方針を1か所にまとめる。
 *
 * 全投稿が公開で、公開 API の応答はログイン状態に依存しないため、
 * 誰に対しても同じ応答を返せる。これを Cloudflare のエッジ（Worker の Cache API）で
 * 吸収し、Cloud Run と Neon にリクエストを届かせないことで Neon を眠らせる。
 * 人ごとの情報（未読数・自分のリアクション）は別エンドポイントに分け、private にする。
 */
final class CacheHeaders
{
    /** ロビー・部屋・スレッド・タグ。新着の鮮度を優先する。 */
    public const FRESH = 15;

    /** 人気の部屋・会社。集計が重く、数分の遅れは問題にならない。 */
    public const AGGREGATE = 300;

    /** 旧ブログのアーカイブ。更新されない。 */
    public const ARCHIVE = 3600;

    public static function public(Response $response, int $seconds): Response
    {
        // ブラウザには持たせず（max-age=0）、エッジだけで共有キャッシュする
        $response->headers->set('Cache-Control', sprintf('public, max-age=0, s-maxage=%d', $seconds));

        return $response;
    }

    public static function private(Response $response): Response
    {
        $response->headers->set('Cache-Control', 'private, no-store');

        return $response;
    }
}
