import { Link } from '@tanstack/react-router'
import type { RoomSummary } from '@blog/api-client'
import { Avatar } from './Avatar'
import { formatPostTime } from '../../lib/format'

type Props = {
  room: RoomSummary
  /** count の意味（「未読」「盛り上がり」など）。渡さなければ count は出さない */
  countLabel?: string
}

export function RoomCard({ room, countLabel }: Props) {
  const count = room.count ?? 0

  return (
    <Link
      to="/@{$handle}"
      params={{ handle: room.user.handle }}
      className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 transition-colors hover:border-accent"
    >
      <Avatar user={room.user} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">
          {room.user.displayName}
          <span className="ml-1.5 text-xs font-normal text-text-muted">
            @{room.user.handle}
          </span>
        </p>
        <p className="truncate text-xs text-text-muted">
          {room.bio ??
            (room.lastPostAt
              ? `最終投稿 ${formatPostTime(room.lastPostAt)}`
              : 'まだ投稿がありません')}
        </p>
      </div>
      {countLabel && count > 0 && (
        <span
          className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-bg"
          title={countLabel}
        >
          {count}
        </span>
      )}
    </Link>
  )
}
