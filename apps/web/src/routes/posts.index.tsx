import { createFileRoute } from '@tanstack/react-router'
import { fetchArchivedPosts } from '../lib/archive'
import { ArchivedPostCard } from '../components/ArchivedPostCard'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { Pagination } from '../components/Pagination'
import { site } from '../lib/site'

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
  head: ({ loaderData }) => ({
    meta: [
      { title: `旧ブログの記事 | ${site.title}` },
      {
        name: 'description',
        content: loaderData
          ? `${site.title} になる前の旧ブログの記事です。全${loaderData.total}件。`
          : `${site.title} になる前の旧ブログの記事です。`,
      },
    ],
  }),
  component: PostsIndex,
})

function PostsIndex() {
  const posts = Route.useLoaderData()
  const { page = 1 } = Route.useSearch()

  return (
    <div>
      <PageHeader title="旧ブログの記事" description={`${posts.total} 件`} />

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
