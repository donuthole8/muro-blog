import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

/**
 * 静的化するのは robots.txt だけ。記事・times の画面・RSS・サイトマップは SSR にして、
 * 公開 API の応答をエッジでキャッシュする（lib/edgeCache.ts 参照）。
 * 記事の公開や D1 の書き換えが再デプロイなしで反映される。
 */
const staticPages = [
  {
    path: '/robots.txt',
    prerender: { enabled: true },
  },
]

export default defineConfig({
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
        failOnError: true,
      },
      // サイトマップは routes/sitemap[.]xml.ts がリクエストのたびに作る
      sitemap: { enabled: false },
      pages: staticPages,
    }),
    viteReact(),
  ],
})
