/**
 * 公開 API の GET を Cloudflare のエッジ（Workers の Cache API）でキャッシュする。
 *
 * API は公開 GET に `Cache-Control: public, s-maxage=…` を付けて返す。
 * それをエッジに置いておけば、同じ URL へのリクエストは API の Worker にも D1 にも届かず、
 * Workers のリクエスト数と D1 の読み取り行数の無料枠を節約できる。
 *
 * - キャッシュするのは GET かつ応答が public のものだけ（ログイン中の API は private）
 * - 有効期間は応答の s-maxage に従う（ロビー 15 秒、人気の部屋 5 分など）
 * - Cache API は独自ドメインの Worker でしか効かない（*.workers.dev やローカルでは素通し）
 */
export async function edgeCachedFetch(
  request: Request,
  upstream: (request: Request) => Promise<Response> = fetch,
): Promise<Response> {
  const cache = defaultCache()
  if (request.method !== 'GET' || !cache) return upstream(request)

  const hit = await cache.match(request)
  if (hit) return hit

  const response = await upstream(request)
  const cacheControl = response.headers.get('Cache-Control') ?? ''
  if (response.ok && /\bpublic\b/.test(cacheControl)) {
    try {
      await cache.put(request, response.clone())
    } catch {
      // キャッシュに置けなくても応答そのものは返せる
    }
  }

  return response
}

function defaultCache(): Cache | null {
  const storage = (
    globalThis as { caches?: CacheStorage & { default?: Cache } }
  ).caches

  return storage?.default ?? null
}
