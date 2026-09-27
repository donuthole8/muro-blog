import { createFileRoute } from '@tanstack/react-router'
import { fetchArchivedPosts } from '../lib/archive'
import { ArchivedPostCard } from '../components/ArchivedPostCard'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { Pagination } from '../components/Pagination'
import { site } from '../lib/site'
import { canonical, pageSuffix } from '../lib/seo'

type PostsSearch = {
  /**
   * 1 ページ目では省略する。
   * 常に付けると /posts が /posts?page=1 へリダイレクトされてしまい、
   * 正規 URL が2つに割れる。
   */
  page?: number
}

export const Route = createFileRoute('/posts/')({
  validateSearch: (search: Record<string, unknown>): PostsSearch => {
    const page = Number(search.page)

    return Number.isFinite(page) && page > 1 ? { page } : {}
  },
  loaderDeps: ({ search }) => ({ page: search.page ?? 1 }),
  loader: ({ deps }) => fetchArchivedPosts({ data: { page: deps.page } }),
  head: ({ loaderData, match }) => {
    const page = match.search.page ?? 1
    const title = `ブログ${pageSuffix(page)} | ${site.title}`
    const description = loaderData
      ? `${site.title} のみんなが書いたブログ記事です。全${loaderData.total}件。`
      : `${site.title} のみんなが書いたブログ記事です。`

    return {
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:url', content: canonical('/posts', page).href },
      ],
      links: [canonical('/posts', page)],
    }
  },
  component: PostsIndex,
})

function PostsIndex() {
  const posts = Route.useLoaderData()
  const { page = 1 } = Route.useSearch()

  return (
    <div>
      <PageHeader title="ブログ" description={`${posts.total} 件`} />

      {posts.items.length === 0 ? (
        <EmptyState icon="📦" title="記事がありません" />
      ) : (
        <div>
          {posts.items.map((post) => (
            <ArchivedPostCard key={post.id} post={post} />
          ))}
        </div>
      )}

      <Pagination currentPage={page} totalPages={posts.totalPages} />
    </div>
  )
}
