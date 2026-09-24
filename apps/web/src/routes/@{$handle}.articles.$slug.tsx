import { createFileRoute } from '@tanstack/react-router'
import { ArticleView } from '../components/articles/ArticleView'
import { fetchUserArticle } from '../lib/articles'
import { imageUrl } from '../lib/image'
import { site } from '../lib/site'

export const Route = createFileRoute('/@{$handle}/articles/$slug')({
  loader: ({ params }) =>
    fetchUserArticle({ data: { handle: params.handle, slug: params.slug } }),
  head: ({ loaderData, params }) => {
    if (!loaderData) return { meta: [] }

    const description = loaderData.excerpt ?? site.description
    const url = `${site.url}/@${params.handle}/articles/${params.slug}`
    // 共有カード画像は書き手のブラウザが公開時に描いたもの（lib/ogImage.ts）。無ければ共通の画像
    const ogImage = loaderData.ogImageKey
      ? `${site.url}${imageUrl(loaderData.ogImageKey)}`
      : `${site.url}${site.ogImage}`

    return {
      meta: [
        { title: `${loaderData.title} | ${site.title}` },
        { name: 'description', content: description },
        { property: 'og:title', content: loaderData.title },
        { property: 'og:type', content: 'article' },
        { property: 'og:description', content: description },
        { property: 'og:url', content: url },
        { property: 'og:image', content: ogImage },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { name: 'twitter:image', content: ogImage },
        ...(loaderData.publishedAt
          ? [
              {
                property: 'article:published_time',
                content: loaderData.publishedAt,
              },
            ]
          : []),
        { name: 'twitter:title', content: loaderData.title },
        { name: 'twitter:description', content: description },
      ],
      links: [{ rel: 'canonical', href: url }],
    }
  },
  component: UserArticlePage,
})

function UserArticlePage() {
  const post = Route.useLoaderData()

  return <ArticleView post={post} />
}
