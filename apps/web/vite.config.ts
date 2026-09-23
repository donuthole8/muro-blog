import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

/** 本番の公開 URL。サイトマップの絶対 URL に使う。 */
const siteUrl = process.env.SITE_URL ?? 'http://localhost:3000'

/** 静的化もサイトマップ掲載もしない管理画面のパス */
const adminPages = ['/admin', '/admin/', '/admin/posts/new'].map((path) => ({
  path,
  sitemap: { exclude: true },
  prerender: { enabled: false },
}))

/**
 * フィードと robots.txt は静的化するが、サイトマップにページとしては載せない。
 * robots.txt は /rss.xml と違いどこからもリンクされないため、
 * crawlLinks に頼らず明示的に prerender 対象へ加える。
 */
const feedPages = [
  { path: '/rss.xml', sitemap: { exclude: true } },
  { path: '/robots.txt', sitemap: { exclude: true } },
]

/*
 * 末尾スラッシュ版を除外して正規 URL を1つに絞る。
 * ルート自動探索は /posts と /posts/ の両方を見つけてしまい、
 * そのままだと同じ内容が2つの URL で配信されて重複コンテンツになる。
 * サイト内リンクはすべてスラッシュなし側を指している。
 */
const trailingSlashDuplicates = ['/posts/', '/tags/'].map((path) => ({
  path,
  sitemap: { exclude: true },
  prerender: { enabled: false },
}))

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tailwindcss(),
    tanstackStart({
      /*
       * 公開ページはビルド時に静的化する。
       *
       * Symfony API は Cloud Run 上で scale-to-zero のためコールドスタートする。
       * 読者のリクエストがそこへ届く設計にすると表示が破綻するので、
       * ビルド時に一度だけ API を叩いて HTML を作り切ってしまう。
       *
       * crawlLinks により / から辿れるページ（記事詳細・タグ別一覧を含む）が
       * 自動的に対象になる。ビルド時は API が起動している必要がある。
       */
      prerender: {
        enabled: true,
        crawlLinks: true,
        autoStaticPathsDiscovery: true,
        concurrency: 4,
        // 記事の取得に失敗したまま空の HTML を公開しないよう、失敗はビルドを止める
        failOnError: true,
        // 管理画面は静的化しない。常にサーバー側で描画し、認証の前段を通す。
        filter: (page) => !page.path.startsWith('/admin'),
      },
      sitemap: {
        enabled: true,
        host: siteUrl,
      },
      /*
       * 管理画面は公開サイトの一部ではない。
       * prerender の filter は静的化を止めるだけでサイトマップには効かないため、
       * ページ単位で明示的に除外する。
       */
      pages: [...adminPages, ...feedPages, ...trailingSlashDuplicates],
    }),
    viteReact(),
  ],
})

export default config
