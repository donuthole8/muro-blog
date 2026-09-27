import type { JSX } from 'react'
import type { ArchivedPostDetail } from '@blog/api-client'
import { htmlExcerpt } from './format'
import { imageUrl } from './image'
import { articlePath, roomName, site } from './site'

/**
 * 検索エンジン向けの head の部品（canonical・構造化データ）。
 *
 * TanStack Router は meta を name / property ごとに子ルート優先で1つにまとめるが、
 * links はまとめない。canonical はルートごとに1つだけ付けること（__root.tsx には置かない）。
 */

/** サイト内のパスを公開 URL にする。 */
export function absoluteUrl(path: string): string {
  return `${site.url}${path}`
}

/** 正規 URL。ページ送りの2ページ目以降は、そのページ自身を指す。 */
export function canonical(path: string, page = 1) {
  return {
    rel: 'canonical',
    href: absoluteUrl(page > 1 ? `${path}?page=${page}` : path),
  }
}

/** 2ページ目以降のタイトルに付ける印（1ページ目と同じタイトルが並ばないように）。 */
export function pageSuffix(page = 1): string {
  return page > 1 ? `（${page}ページ目）` : ''
}

/**
 * JSON-LD の meta。HeadContent が <script type="application/ld+json"> にして出す
 * （< > & はエスケープされるので、本文由来の文字列を入れても </script> で抜けられない）。
 * 実行時はこの形を受け付けるが、@tanstack/react-router の head の型は <meta> の属性しか
 * 許さないので、型だけ合わせる。
 */
export function jsonLd(
  data: Record<string, unknown>,
): JSX.IntrinsicElements['meta'] {
  return {
    'script:ld+json': { '@context': 'https://schema.org', ...data },
  } as JSX.IntrinsicElements['meta']
}

/** パンくず（検索結果に階層として出る）。最後の要素が今のページ。 */
export function breadcrumbJsonLd(items: Array<{ name: string; path: string }>) {
  return jsonLd({
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  })
}

/**
 * 記事ページ（旧ブログの /posts/:slug とユーザーの /@handle/articles/:slug）の head。
 *
 * 共有カード画像は、ユーザーの記事なら書き手のブラウザが公開時に描いたもの（lib/ogImage.ts）、
 * 旧ブログの記事ならビルド時に生成したもの（scripts/generate-og-images.mjs）。
 * ユーザーの記事で画像が無ければ共通の画像にする。
 */
export function articleHead(post: ArchivedPostDetail) {
  const path = articlePath(post)
  const url = absoluteUrl(path)
  // 要約を書いていない記事は本文の冒頭で代える（全ページ同じ説明文にならないように）
  const description =
    post.excerpt || htmlExcerpt(post.bodyHtml, 120) || site.description
  const ogImage = post.author
    ? absoluteUrl(post.ogImageKey ? imageUrl(post.ogImageKey) : site.ogImage)
    : absoluteUrl(`/og/${post.slug}.png`)

  const crumbs = post.author
    ? [
        { name: site.title, path: '/' },
        {
          name: `#${roomName(post.author.handle)}`,
          path: `/@${post.author.handle}`,
        },
        { name: '記事', path: `/@${post.author.handle}/articles` },
        { name: post.title, path },
      ]
    : [
        { name: site.title, path: '/' },
        { name: 'ブログ', path: '/posts' },
        { name: post.title, path },
      ]

  return {
    meta: [
      { title: `${post.title} | ${site.title}` },
      { name: 'description', content: description },
      { property: 'og:title', content: post.title },
      { property: 'og:type', content: 'article' },
      { property: 'og:description', content: description },
      { property: 'og:url', content: url },
      { property: 'og:image', content: ogImage },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { name: 'twitter:image', content: ogImage },
      { name: 'twitter:title', content: post.title },
      { name: 'twitter:description', content: description },
      ...(post.publishedAt
        ? [{ property: 'article:published_time', content: post.publishedAt }]
        : []),
      { property: 'article:modified_time', content: post.updatedAt },
      ...(post.author
        ? [
            {
              property: 'article:author',
              content: absoluteUrl(`/@${post.author.handle}`),
            },
          ]
        : []),
      articleJsonLd(post, { url, image: ogImage, description }),
      breadcrumbJsonLd(crumbs),
    ],
    links: [{ rel: 'canonical', href: url }],
  }
}

/** 記事ページの BlogPosting。書き手のいない旧ブログの記事はサイトの書き手の名前で出す。 */
export function articleJsonLd(
  post: ArchivedPostDetail,
  {
    url,
    image,
    description,
  }: { url: string; image: string; description: string },
) {
  const author = post.author
    ? {
        '@type': 'Person',
        name: post.author.displayName,
        url: absoluteUrl(`/@${post.author.handle}`),
      }
    : { '@type': 'Person', name: site.author }

  return jsonLd({
    '@type': 'BlogPosting',
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    headline: post.title,
    description,
    image: [image],
    ...(post.publishedAt ? { datePublished: post.publishedAt } : {}),
    dateModified: post.updatedAt,
    author,
    publisher: { '@type': 'Organization', name: site.title, url: site.url },
    keywords: post.tags.map((tag) => tag.name).join(', ') || undefined,
    inLanguage: 'ja',
  })
}
