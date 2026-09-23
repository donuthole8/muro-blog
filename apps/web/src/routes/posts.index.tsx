import { createFileRoute } from '@tanstack/react-router'
import { fetchPosts } from '../lib/blog'
import { PostCard } from '../components/PostCard'
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
  loader: ({ deps }) => fetchPosts({ data: { page: deps.page } }),
  head: ({ loaderData }) => ({
    meta: [
      { title: `記事一覧 | ${site.title}` },
      {
        name: 'description',
        content: loaderData
          ? `${site.title}の記事一覧です。全${loaderData.total}件。`
          : `${site.title}の記事一覧です。`,
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
      <h1 className="text-xl font-bold">記事一覧</h1>
      <p className="mt-1 text-xs text-text-muted">{posts.total} 件</p>

      {posts.items.length === 0 ? (
        <p className="mt-8 text-sm text-text-muted">記事がありません。</p>
      ) : (
        <div className="mt-4">
          {posts.items.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}

      <Pagination currentPage={page} totalPages={posts.totalPages} />
    </div>
  )
}
