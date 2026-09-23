import { apiBaseUrl } from './api'
import { edgeCachedFetch } from './edgeCache'

/**
 * Symfony が描いた OGP 画像を中継する（サーバールートからのみ呼ぶ）。
 *
 * 描画は重いので、応答の s-maxage（1日）に従ってエッジに置く。
 * 画像が作れない（部屋がない・フォント未設置など）ときはサイト共通の画像に回す。
 */
export async function proxyOgImage(apiPath: string, request: Request) {
  const upstream = await edgeCachedFetch(
    new Request(`${apiBaseUrl()}${apiPath}`),
  )

  if (!upstream.ok) {
    return Response.redirect(new URL('/og-image.png', request.url), 302)
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control':
        upstream.headers.get('Cache-Control') ?? 'public, max-age=3600',
    },
  })
}
