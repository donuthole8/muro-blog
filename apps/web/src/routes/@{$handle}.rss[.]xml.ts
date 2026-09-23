import { createFileRoute } from '@tanstack/react-router'
import { getApiClient } from '../lib/api'
import { htmlExcerpt } from '../lib/format'
import { imageUrl } from '../lib/image'
import { site } from '../lib/site'

/**
 * 部屋ごとの RSS（/@:handle/rss.xml）。最新の親投稿（1ページ分）を並べる。
 *
 * 公開 API の応答はエッジでキャッシュされ、この XML 自体もブラウザ・リーダー側で
 * 10 分持たせるので、RSS リーダーの定期取得が Neon を起こし続けることはない。
 */
export const Route = createFileRoute('/@{$handle}/rss.xml')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const handle = params.handle.toLowerCase()
        const api = getApiClient()
        const [{ data: profile }, { data: page }] = await Promise.all([
          api.fetch.GET('/api/users/{handle}', {
            params: { path: { handle } },
          }),
          api.fetch.GET('/api/users/{handle}/posts', {
            params: { path: { handle } },
          }),
        ])

        if (!profile || !page || profile.suspended) {
          return new Response('Not Found', { status: 404 })
        }

        const roomUrl = `${site.url}/@${handle}`
        const items = page.items
          .filter((post) => post.state === 'visible')
          .map((post) => {
            const url = `${roomUrl}/${post.id}`
            const title = htmlExcerpt(post.bodyHtml, 60) || '（画像の投稿）'
            const image = post.imageKey
              ? `<p><img src="${absolute(imageUrl(post.imageKey))}" alt="" /></p>`
              : ''
            const body = absolutizeLinks(post.bodyHtml) + image

            return `    <item>
      <title>${escapeXml(title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <pubDate>${new Date(post.createdAt).toUTCString()}</pubDate>
      <description>${escapeXml(body)}</description>
${post.tags.map((tag) => `      <category>${escapeXml(tag.name)}</category>`).join('\n')}
    </item>`
          })
          .join('\n')

        const title = `${profile.displayName}（@${handle}）の times | ${site.title}`
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${escapeXml(roomUrl)}</link>
    <description>${escapeXml(profile.bio ?? `${profile.displayName} さんの times（分報）です。`)}</description>
    <language>ja</language>
    <atom:link href="${escapeXml(`${roomUrl}/rss.xml`)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`

        return new Response(xml, {
          headers: {
            'Content-Type': 'application/rss+xml; charset=utf-8',
            'Cache-Control': 'public, max-age=600',
          },
        })
      },
    },
  },
})

function absolute(path: string) {
  return path.startsWith('/') ? `${site.url}${path}` : path
}

/** 本文のサイト内リンク（/@handle のメンション、/tags など）を絶対 URL にする。 */
function absolutizeLinks(html: string) {
  return html.replace(
    /\b(href|src)="\/(?!\/)/g,
    (_match, attr: string) => `${attr}="${site.url}/`,
  )
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
