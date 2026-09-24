import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

/** 本番の公開 URL。サイトマップの絶対 URL に使う。 */
const siteUrl = process.env.SITE_URL ?? 'http://localhost:3000'
const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:8000'

/**
 * 旧ブログのアーカイブ記事（/posts/:slug）をサイトマップに載せるため、ビルド時に API から
 * 記事の一覧を取ってページを列挙する（ビルド中は API が起動している必要がある）。
 *
 * ページそのものは静的化せず SSR にする。D1 の本文を書き換えれば再デプロイなしで反映され、
 * 公開 API の応答はエッジでキャッシュされる（lib/edgeCache.ts 参照）。
 */
async function archivePages() {
  const slugs: Array<string> = []
  let page = 1
  let totalPages = 1

  do {
    const res = await fetch(
      `${apiBaseUrl}/api/archive/posts?page=${page}&perPage=50`,
    )
    if (!res.ok) {
      throw new Error(
        `アーカイブ記事の一覧を取得できませんでした（${res.status}）。API は起動していますか？`,
      )
    }
    /*
     * res.json() は any を返すので、この as を外すと body が unknown になり
     * tsc が TS18046 で落ちる。lint は「型が変わらない不要な as」と判定するが、
     * 実際には外せないので、ここだけルールを無効にする。
     * （これを消すと pnpm format のたびにビルドが壊れる）
     */
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- 外すと TS18046 になる
    const body = (await res.json()) as {
      items: Array<{ slug: string }>
      totalPages: number
    }
    slugs.push(...body.items.map((item) => item.slug))
    totalPages = body.totalPages
    page += 1
  } while (page <= totalPages)

  return slugs.map((slug) => ({
    path: `/posts/${slug}`,
    prerender: { enabled: false },
  }))
}

/**
 * 静的化するのはフィードと robots.txt だけ。サイトマップにページとしては載せない。
 */
const feedPages = [
  {
    path: '/rss.xml',
    sitemap: { exclude: true },
    prerender: { enabled: true },
  },
  {
    path: '/robots.txt',
    sitemap: { exclude: true },
    prerender: { enabled: true },
  },
]

export default defineConfig(async ({ command }) => ({
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tailwindcss(),
    tanstackStart({
      prerender: {
        enabled: true,
        // リンクを辿って静的化すると times の画面まで拾ってしまうので、列挙したページだけにする
        crawlLinks: false,
        autoStaticPathsDiscovery: false,
        concurrency: 4,
        // 記事の取得に失敗したまま空の HTML を公開しないよう、失敗はビルドを止める
        failOnError: true,
        filter: (page) => feedPages.some((feed) => feed.path === page.path),
      },
      sitemap: {
        enabled: true,
        host: siteUrl,
      },
      // 開発サーバーの起動時には API を叩かない（ビルド時だけ列挙する）
      pages:
        command === 'build' ? [...(await archivePages()), ...feedPages] : [],
    }),
    viteReact(),
  ],
}))
