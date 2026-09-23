import { useEffect } from 'react'
import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import type { Me, NotificationItem } from '@blog/api-client'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { Avatar } from '../components/times/Avatar'
import { markNotificationsRead } from '../lib/account'
import { formatPostTime } from '../lib/format'
import { meQuery, notificationsQuery } from '../lib/queries'
import { loginUrl, site } from '../lib/site'

export const Route = createFileRoute('/notifications')({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery)
    if (!me)
      throw redirect({ href: loginUrl('/notifications'), reloadDocument: true })
  },
  loader: ({ context }) =>
    context.queryClient.ensureInfiniteQueryData(notificationsQuery),
  head: () => ({
    meta: [
      { title: `通知 | ${site.title}` },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: Notifications,
})

const labels: Record<NotificationItem['type'], string> = {
  reply: 'があなたの投稿に返信しました',
  mention: 'があなたをメンションしました',
  reaction: 'があなたの投稿にリアクションしました',
}

function Notifications() {
  const queryClient = useQueryClient()
  const query = useInfiniteQuery(notificationsQuery)
  const items = query.data?.pages.flatMap((page) => page?.items ?? []) ?? []

  // 開いたら既読にする。今回の表示では未読の印を残し、ベルの数字だけ消す
  useEffect(() => {
    void markNotificationsRead().then(() =>
      queryClient.setQueryData<Me | null>(meQuery.queryKey, (me) =>
        me ? { ...me, unreadNotificationCount: 0 } : me,
      ),
    )
  }, [queryClient])

  return (
    <div>
      <PageHeader title="通知" />

      {items.length === 0 ? (
        <EmptyState
          icon="🔔"
          title="通知はまだありません"
          description="返信・メンション・リアクションがあると、ここに出ます。"
        />
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <li key={item.id}>
              <NotificationRow item={item} />
            </li>
          ))}
        </ul>
      )}

      {query.hasNextPage && (
        <div className="py-6 text-center">
          <Button
            variant="ghost"
            onClick={() => void query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
          >
            {query.isFetchingNextPage ? '読み込み中…' : 'もっと見る'}
          </Button>
        </div>
      )}
    </div>
  )
}

function NotificationRow({ item }: { item: NotificationItem }) {
  const body = (
    <div className="flex gap-3 py-3">
      <Avatar user={item.actor} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          {!item.readAt && (
            <span
              aria-label="未読"
              className="mr-1.5 inline-block h-2 w-2 rounded-full bg-accent"
            />
          )}
          <span className="font-bold">
            {item.actor?.displayName ?? '退会したユーザー'}
          </span>
          {labels[item.type]}
        </p>
        <p className="mt-0.5 truncate text-xs text-text-muted">
          {item.excerpt}
        </p>
        <time
          className="text-[0.7rem] text-text-muted"
          suppressHydrationWarning
        >
          {formatPostTime(item.createdAt)}
        </time>
      </div>
    </div>
  )

  if (!item.threadHandle) return body

  return (
    <Link
      to="/@{$handle}/$postId"
      params={{ handle: item.threadHandle, postId: item.threadId }}
      hash={item.postId !== item.threadId ? `reply-${item.postId}` : undefined}
      className="block transition-colors hover:bg-surface"
    >
      {body}
    </Link>
  )
}
