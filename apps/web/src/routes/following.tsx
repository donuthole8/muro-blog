import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { buttonClass } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { RoomCard } from '../components/times/RoomCard'
import { followingQuery, meQuery } from '../lib/queries'
import { loginUrl, site } from '../lib/site'

export const Route = createFileRoute('/following')({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery)
    if (!me)
      throw redirect({ href: loginUrl('/following'), reloadDocument: true })
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(followingQuery),
  head: () => ({
    meta: [
      { title: `フォロー中 | ${site.title}` },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: Following,
})

/**
 * フォロー中の部屋と未読数。
 * フォローした人の投稿を混ぜたフィードは作らない（人ごとに中身が変わってキャッシュできないため）。
 */
function Following() {
  const rooms = useQuery(followingQuery).data ?? []

  return (
    <div>
      <PageHeader
        title="フォロー中の部屋"
        description="数字は最後に部屋を開いてからの新しい投稿の数です。"
      />

      {rooms.length === 0 ? (
        <EmptyState
          icon="👀"
          title="まだ誰もフォローしていません"
          description="気になる部屋をフォローすると、新しい投稿の数がここに出ます。"
          action={
            <Link to="/" className={buttonClass({ size: 'sm' })}>
              ロビーで部屋を探す
            </Link>
          }
        />
      ) : (
        <div className="grid gap-2">
          {rooms.map((room) => (
            <RoomCard key={room.user.handle} room={room} countLabel="未読" />
          ))}
        </div>
      )}
    </div>
  )
}
