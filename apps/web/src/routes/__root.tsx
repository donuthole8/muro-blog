import {
  HeadContent,
  Link,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'

import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'
import { SiteHeader } from '../components/SiteHeader'
import { SiteFooter } from '../components/SiteFooter'
import { site } from '../lib/site'

import appCss from '../styles.css?url'

import type { QueryClient } from '@tanstack/react-query'

interface MyRouterContext {
  queryClient: QueryClient
}

/**
 * 保存済みのテーマを描画前に <html> へ反映する。
 * これがないと、システムがライトでダークを選んでいる場合に
 * 一瞬白い画面が出る（FOUC）。
 */
const themeScript = `
(function () {
  try {
    var t = localStorage.getItem('theme');
    if (t === 'light' || t === 'dark') {
      document.documentElement.setAttribute('data-theme', t);
    }
  } catch (e) {}
})();
`

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: site.title },
      { name: 'description', content: site.description },
      { property: 'og:site_name', content: site.title },
      { property: 'og:image', content: `${site.url}${site.ogImage}` },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      // 絵文字の字形を端末任せにせず Noto Color Emoji（Android 寄り）に揃える。
      // サブセット配信なので、実際に使う絵文字の分しか落ちてこない。
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      {
        rel: 'preconnect',
        href: 'https://fonts.gstatic.com',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Noto+Color+Emoji&display=swap',
      },
      { rel: 'alternate', type: 'application/rss+xml', href: '/rss.xml' },
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      { rel: 'icon', type: 'image/png', href: '/favicon-32x32.png' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
    ],
    scripts: [{ children: themeScript }],
  }),
  shellComponent: RootDocument,
  notFoundComponent: NotFound,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    // data-theme は themeScript がハイドレーション前に付けるため、サーバー HTML との差分は意図どおり
    <html lang="ja" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <div className="flex min-h-screen flex-col">
          <SiteHeader />
          <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10">
            {children}
          </main>
          <SiteFooter />
        </div>

        {import.meta.env.DEV && (
          <TanStackDevtools
            config={{ position: 'bottom-right' }}
            plugins={[
              {
                name: 'Tanstack Router',
                render: <TanStackRouterDevtoolsPanel />,
              },
              TanStackQueryDevtools,
            ]}
          />
        )}
        <Scripts />
      </body>
    </html>
  )
}

function NotFound() {
  return (
    <div className="py-12 text-center">
      <p className="font-mono text-5xl text-text-muted">404</p>
      <h1 className="mt-4 text-xl font-bold">ページが見つかりません</h1>
      <p className="mt-2 text-sm text-text-muted">
        URL が変わったか、記事が下書きに戻された可能性があります。
      </p>
      <Link
        to="/"
        className="mt-6 inline-block text-sm text-accent hover:underline"
      >
        トップへ戻る
      </Link>
    </div>
  )
}
