import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { followingQuery, useMe } from '../lib/queries'
import { roomAccentStyle } from '../lib/roomColor'
import { roomName } from '../lib/site'

/**
 * Slack のような左サイドバー。自分の times とフォロー中の times をチャンネルとして並べる。
 * 未読がある部屋は太字にして件数を出す。狭い画面ではヘッダーのメニュー（MobileNav）に同じ一覧を出す。
 */
export function Sidebar() {
  const me = useMe()
  if (!me?.handle) return null

  return (
    <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 overflow-y-auto border-r border-border px-3 py-6 lg:block">
      <ChannelNav />
    </aside>
  )
}

/** 自分の部屋とフォロー中の部屋の一覧。handle 未決定なら何も出さない。 */
export function ChannelNav() {
  const me = useMe()
  const rooms = useQuery({
    ...followingQuery,
    enabled: me?.handle != null,
  }).data

  if (!me?.handle) return null

  return (
    <nav aria-label="チャンネル" className="space-y-6 text-sm">
      <div className="space-y-0.5">
        <SidebarLink to="/" exact>
          <span className="w-4 text-center text-text-muted">~</span>
          チャンネル
        </SidebarLink>
        <ChannelLink handle={me.handle} />
      </div>

      <section>
        <h2 className="mb-1 px-2 text-xs font-bold tracking-wider text-text-muted">
          フォロー中
        </h2>
        <div className="space-y-0.5">
          {rooms?.map((room) => (
            <ChannelLink
              key={room.user.handle}
              handle={room.user.handle}
              unread={room.count ?? 0}
            />
          ))}
          {rooms?.length === 0 && (
            <p className="px-2 py-1 text-xs text-text-muted">
              気になる times をフォローすると、ここに並びます。
            </p>
          )}
        </div>
      </section>
    </nav>
  )
}

const itemClass =
  'flex min-h-10 items-center lg:min-h-8 gap-1.5 rounded-md px-2 text-text-muted transition-colors hover:bg-accent-soft hover:text-text'

function SidebarLink({
  to,
  exact,
  children,
}: {
  to: '/'
  exact?: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      to={to}
      className={itemClass}
      activeOptions={{ exact }}
      activeProps={{ className: 'bg-accent-soft !text-accent font-bold' }}
    >
      {children}
    </Link>
  )
}

function ChannelLink({
  handle,
  unread = 0,
}: {
  handle: string
  unread?: number
}) {
  return (
    <Link
      to="/@{$handle}"
      params={{ handle }}
      // 部屋の色を # に乗せて、並びの中で見分けやすくする
      style={roomAccentStyle(handle)}
      className={`${itemClass} ${unread > 0 ? 'font-bold text-text' : ''}`}
      activeOptions={{ exact: false }}
      activeProps={{ className: 'bg-accent-soft !text-accent font-bold' }}
    >
      <span className="w-4 text-center text-accent">#</span>
      <span className="min-w-0 flex-1 truncate">{roomName(handle)}</span>
      {unread > 0 && (
        <span className="shrink-0 rounded-full bg-accent px-1.5 text-[0.65rem] leading-4 font-bold text-bg">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  )
}
