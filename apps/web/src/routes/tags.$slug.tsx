import { Link, createFileRoute, notFound } from '@tanstack/react-router'
import { fetchPosts, fetchTags } from '../lib/blog'
import { PostCard } from '../components/PostCard'
import { site } from '../lib/site'

export const Route = createFileRoute('/tags/$slug')({
  loader: async ({ params }) => {
    const tags = await fetchTags()
    const tag = tags.find((t) => t.slug === params.slug)

    // 公開記事を持たないタグはページを作らない
    if (!tag) throw notFound()

    return {
      tag,
      posts: await fetchPosts({ data: { page: 1, tag: params.slug } }),
    }
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [] }

    const title = `#${loaderData.tag.name} の記事 | ${site.title}`
    const description = `「${loaderData.tag.name}」タグが付いた記事の一覧です。`

    return {
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
      ],
    }
  },
  component: TagDetail,
})

function TagDetail() {
  const { tag, posts } = Route.useLoaderData()

  return (
    <div>
      <h1 className="text-xl font-bold">
        <span className="text-text-muted">#</span>
        {tag.name}
      </h1>
      <p className="mt-1 text-xs text-text-muted">{posts.total} 件</p>

      <div className="mt-4">
        {posts.items.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>

      <Link
        to="/tags"
        className="mt-10 inline-block text-sm text-accent hover:underline"
      >
        ← タグ一覧へ
      </Link>
    </div>
  )
}
