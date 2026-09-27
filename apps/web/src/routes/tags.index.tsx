import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { TagChip } from '../components/TagChip'
import { tagsQuery } from '../lib/queries'
import { site } from '../lib/site'
import { canonical } from '../lib/seo'

export const Route = createFileRoute('/tags/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(tagsQuery),
  head: () => ({
    meta: [
      { title: `タグ | ${site.title}` },
      {
        name: 'description',
        content: `${site.title}のトピックタグの一覧です。`,
      },
      { property: 'og:title', content: `タグ | ${site.title}` },
      { property: 'og:url', content: canonical('/tags').href },
    ],
    links: [canonical('/tags')],
  }),
  component: TagsIndex,
})

function TagsIndex() {
  const tags = useQuery(tagsQuery).data ?? []

  return (
    <div>
      <PageHeader
        title="タグ"
        description="投稿するときに付けられるトピックです。"
      />

      {tags.length === 0 ? (
        <EmptyState icon="🏷" title="タグがありません" />
      ) : (
        <div className="flex flex-wrap gap-2">
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
