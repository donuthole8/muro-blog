import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { Skeleton } from '../components/Skeleton'
import { RoomCard } from '../components/times/RoomCard'
import { orgQuery } from '../lib/queries'
import { site } from '../lib/site'

export const Route = createFileRoute('/org/$companySlug')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(orgQuery(params.companySlug)),
  head: ({ loaderData: org }) => ({
    meta: org
      ? [
          { title: `${org.name} の人たちの times | ${site.title}` },
          {
            name: 'description',
            content: `所属を「${org.name}」と自己申告している人の部屋の一覧です。`,
          },
          // 自己申告に基づく一覧なので、会社の公式ページのように検索に出さない
          { name: 'robots', content: 'noindex' },
        ]
      : [],
  }),
  component: Org,
})

function Org() {
  const { companySlug } = Route.useParams()
  const org = useQuery(orgQuery(companySlug)).data

  if (!org) {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    )
  }

  return (
    <div>
      <PageHeader title={`🏢 ${org.name}`} />
      <p className="rounded-md border border-border bg-surface px-3 py-2 text-xs text-text-muted">
        自己申告に基づく一覧です。所属は各自がプロフィールに書いたもので、
        {site.title} では確認していません。
      </p>

      {org.rooms.length === 0 ? (
        <EmptyState
          icon="🏢"
          title="この会社の部屋はまだありません"
          description="所属をプロフィールに書いた人が、ここに並びます。"
        />
      ) : (
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          {org.rooms.map((room) => (
            <RoomCard key={room.user.handle} room={room} />
          ))}
        </div>
      )}
    </div>
  )
}
