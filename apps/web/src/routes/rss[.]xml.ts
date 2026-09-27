import { createFileRoute } from '@tanstack/react-router'
import { fetchArchivedPosts } from '../lib/archive'
import { articlePath, site } from '../lib/site'
import { escapeXml } from '../lib/xml'

/**
 * ブログ記事の RSS（/rss.xml）。旧ブログの記事とユーザーの記事を合わせて新しい順に並べる。
 *
 * ビルド時に作るとデプロイ後に公開された記事が載らないので SSR にする。
 * API の応答はエッジでキャッシュされ（lib/edgeCache.ts）、この XML もリーダー側で1時間持たせる。
 */
export const Route = createFileRoute('/rss.xml')({
  server: {
    handlers: {
      GET: async () => {
        // 最新の1ページ分
        const posts = await fetchArchivedPosts({ data: { page: 1 } })

        const items = posts.items
          .map((post) => {
            const url = `${site.url}${articlePath(post)}`

            return `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      ${post.publishedAt ? `<pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate>` : ''}
      ${post.excerpt ? `<description>${escapeXml(post.excerpt)}</description>` : ''}
${post.tags.map((tag) => `      <category>${escapeXml(tag.name)}</category>`).join('\n')}
    </item>`
          })
          .join('\n')

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(`${site.title} のブログ`)}</title>
    <link>${escapeXml(site.url)}</link>
    <description>${escapeXml(site.description)}</description>
    <language>ja</language>
    <atom:link href="${escapeXml(`${site.url}/rss.xml`)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`

        return new Response(xml, {
          headers: {
            'Content-Type': 'application/rss+xml; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
          },
        })
      },
    },
  },
})
