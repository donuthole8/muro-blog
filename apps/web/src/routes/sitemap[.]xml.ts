import { createFileRoute } from '@tanstack/react-router'
import { getApiClient } from '../lib/api'
import { site } from '../lib/site'
import { escapeXml } from '../lib/xml'

/**
 * サイトマップ（/sitemap.xml）。リクエストのたびに API から公開ページを列挙する。
 *
 * ビルド時に作ると、デプロイ後に公開された記事や新しい部屋が次のデプロイまで載らないので SSR にする。
 * API の応答はエッジで5分キャッシュされ（lib/edgeCache.ts）、この XML もクローラー側で1時間持たせる。
 */
const STATIC_PATHS = ['/', '/posts', '/tags', '/about']

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: async () => {
        const { data } = await getApiClient().fetch.GET('/api/sitemap')
        if (!data) {
          return new Response('Service Unavailable', { status: 503 })
        }

        const entries = [
          ...STATIC_PATHS.map((path) => ({ path, lastModified: null })),
          ...data.articles,
          ...data.articleLists,
          ...data.rooms,
          ...data.tags,
        ]

        const urls = entries
          .map(
            ({ path, lastModified }) => `  <url>
    <loc>${escapeXml(`${site.url}${path}`)}</loc>${
      lastModified ? `\n    <lastmod>${lastModified}</lastmod>` : ''
    }
  </url>`,
          )
          .join('\n')

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`

        return new Response(xml, {
          headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
          },
        })
      },
    },
  },
})
