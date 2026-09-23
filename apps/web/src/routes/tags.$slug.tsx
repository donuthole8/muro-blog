import { Link, createFileRoute } from '@tanstack/react-router'
import { useInfiniteQuery } from '@tanstack/react-query'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { PostList } from '../components/times/PostList'
import { tagPostsQuery } from '../lib/queries'
import { site } from '../lib/site'

export const Route = createFileRoute('/tags/$slug')({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureInfiniteQueryData(
      tagPostsQuery(params.slug),
    )

    return data.pages[0].tag
  },
  head: ({ loaderData: tag }) => {
    if (!tag) return { meta: [] }

    const title = `#${tag.name} の新着 | ${site.title}`
    const description = `「${tag.name}」タグが付いた times の新着です。`

    return {
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
      ],
    }
  },
  component: TagPosts,
})

function TagPosts() {
  const { slug } = Route.useParams()
  const query = useInfiniteQuery(tagPostsQuery(slug))
  const tag = query.data?.pages[0]?.tag
  const posts = query.data?.pages.flatMap((page) => page.items) ?? []

  return (
    <div>
      <PageHeader
        title={
          <>
            <span className="text-text-muted">#</span>
            {tag?.name ?? slug}
          </>
        }
      />

      <PostList
        posts={posts}
        hasNextPage={query.hasNextPage}
        isFetchingNextPage={query.isFetchingNextPage}
        onLoadMore={() => void query.fetchNextPage()}
        isLoading={query.isPending}
        empty={
          <EmptyState
            icon="🏷"
            title="このタグの投稿はまだありません"
            description="投稿するときにこのタグを付けると、ここに並びます。"
          />
        }
      />

      <Link
        to="/tags"
        className="mt-6 inline-block text-sm text-accent hover:underline"
      >
        ← タグ一覧へ
      </Link>
    </div>
  )
}
