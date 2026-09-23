import { createFileRoute } from '@tanstack/react-router'
import { fetchTags } from '../lib/blog'
import { TagChip } from '../components/TagChip'
import { site } from '../lib/site'

export const Route = createFileRoute('/tags/')({
  loader: () => fetchTags(),
  head: () => ({
    meta: [
      { title: `タグ一覧 | ${site.title}` },
      {
        name: 'description',
        content: `${site.title}で使われているタグの一覧です。`,
      },
    ],
  }),
  component: TagsIndex,
})

function TagsIndex() {
  const tags = Route.useLoaderData()

  return (
    <div>
      <h1 className="text-xl font-bold">タグ一覧</h1>
      <p className="mt-1 text-xs text-text-muted">{tags.length} 個</p>

      {tags.length === 0 ? (
        <p className="mt-8 text-sm text-text-muted">タグがありません。</p>
      ) : (
        <div className="mt-6 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <TagChip
              key={tag.slug}
              name={tag.name}
              slug={tag.slug}
              count={tag.postCount}
            />
          ))}
        </div>
      )}
    </div>
  )
}
