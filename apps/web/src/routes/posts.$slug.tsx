import { createFileRoute } from '@tanstack/react-router'
import { fetchArchivedPost } from '../lib/archive'
import { TagChip } from '../components/TagChip'
import { TableOfContents } from '../components/TableOfContents'
import { formatDate, estimateReadingMinutes } from '../lib/format'
import { DEFAULT_EMOJI } from '../lib/emoji'
import { extractToc } from '../lib/toc'
import { site } from '../lib/site'

export const Route = createFileRoute('/posts/$slug')({
  loader: ({ params }) => fetchArchivedPost({ data: { slug: params.slug } }),
  head: ({ loaderData, params }) => {
    if (!loaderData) return { meta: [] }

    const description = loaderData.excerpt ?? site.description
    const url = `${site.url}/posts/${params.slug}`
    // 公開時のビルドで生成される記事ごとの画像。生成前（開発中など）は
    // 存在しなくても404になるだけなので、常にこのパスを指してよい
    const ogImage = `${site.url}/og/${params.slug}.png`

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
  component: PostDetailPage,
})

function PostDetailPage() {
  const post = Route.useLoaderData()

  return (
    <article>
      <header className="border-b border-border pb-6">
        <div
          aria-hidden
          className="mb-5 flex h-24 w-24 items-center justify-center rounded-2xl bg-accent-soft text-5xl"
        >
          {post.emoji || DEFAULT_EMOJI}
        </div>

        <h1 className="text-2xl leading-relaxed font-bold">{post.title}</h1>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {post.publishedAt && (
            <time
              dateTime={post.publishedAt}
              className="font-mono text-xs text-text-muted"
            >
              {formatDate(post.publishedAt)}
            </time>
          )}
          <span className="font-mono text-xs text-text-muted">
            ・約{estimateReadingMinutes(post.bodyHtml)}分
          </span>
          {post.tags.map((tag) => (
            <TagChip key={tag.slug} name={tag.name} slug={tag.slug} />
          ))}
        </div>
      </header>

      <TableOfContents items={extractToc(post.bodyHtml)} />

      {/*
        bodyHtml は旧ブログの時点で Markdown から変換済み。
        記事を書けるのは管理者本人だけなので、そのまま挿入する。
      */}
      <div
        className="prose prose-blog mt-8 max-w-none"
        dangerouslySetInnerHTML={{ __html: post.bodyHtml }}
      />
    </article>
  )
}
