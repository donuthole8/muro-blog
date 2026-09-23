import { Link, createFileRoute } from '@tanstack/react-router'
import { fetchPosts, fetchTags } from '../lib/blog'
import { PostCard } from '../components/PostCard'
import { TagChip } from '../components/TagChip'
import { site } from '../lib/site'

export const Route = createFileRoute('/')({
  loader: async () => ({
    posts: await fetchPosts({ data: { page: 1 } }),
    tags: await fetchTags(),
  }),
  component: Home,
})

function Home() {
  const { posts, tags } = Route.useLoaderData()
  const latest = posts.items.slice(0, 5)

  return (
    <div className="space-y-12">
      <section>
        <h1 className="text-2xl font-bold">{site.title}</h1>
        <p className="mt-2 text-sm text-text-muted">{site.description}</p>
      </section>

      {tags.length > 0 && (
        <section>
          <h2 className="text-xs font-bold tracking-wider text-text-muted uppercase">
            Tags
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {tags.map((tag) => (
              <TagChip
                key={tag.slug}
                name={tag.name}
                slug={tag.slug}
                count={tag.postCount}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-bold tracking-wider text-text-muted uppercase">
            Latest
          </h2>
          <Link to="/posts" className="text-xs text-accent hover:underline">
            すべての記事 →
          </Link>
        </div>

        {latest.length === 0 ? (
          <p className="mt-4 text-sm text-text-muted">
            まだ公開された記事がありません。
          </p>
        ) : (
          <div className="mt-2">
            {latest.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
