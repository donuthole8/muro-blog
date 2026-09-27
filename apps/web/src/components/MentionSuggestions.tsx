import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { UserSummary } from '@blog/api-client'
import { Avatar } from './times/Avatar'
import { fetchMentionCandidates } from '../lib/times'
import { useDebounced } from '../lib/useDebounced'

/** カーソルの直前が「@」+ handle の途中なら、その範囲と入力中の文字列 */
export type MentionQuery = { from: number; to: number; query: string }

/** handle に使える文字（API の lib/policy.ts と同じ）。前が英数字なら（メールアドレスなど）補完しない */
const MENTION_BEFORE_CARET = /(?:^|[^A-Za-z0-9_])@([A-Za-z0-9_]{1,20})$/

export function findMentionQuery(
  text: string,
  caret: number,
): MentionQuery | null {
  const m = MENTION_BEFORE_CARET.exec(text.slice(0, caret))
  if (!m) return null
  return { from: caret - m[1].length - 1, to: caret, query: m[1] }
}

/** 候補を引く。打鍵ごとに API を叩かないよう、入力が止まってから引く */
export function useMentionCandidates(query: string | null) {
  const debounced = useDebounced(query, 150)
  const result = useQuery({
    queryKey: ['mention', debounced?.toLowerCase() ?? ''],
    queryFn: () => fetchMentionCandidates({ data: { q: debounced ?? '' } }),
    enabled: debounced != null && debounced !== '',
    staleTime: 60_000,
  })
  return query == null ? [] : (result.data ?? [])
}

/** キーボードで選ぶ位置。候補が変わったら先頭に戻す */
export function useActiveIndex(count: number) {
  const [active, setActive] = useState(0)
  useEffect(() => setActive(0), [count])
  return {
    active: Math.min(active, Math.max(0, count - 1)),
    move: (delta: number) =>
      setActive((i) => (count === 0 ? 0 : (i + delta + count) % count)),
    setActive,
  }
}

/** メンションの候補リスト。textarea の上か下に重ねて出す。 */
export function MentionSuggestions({
  users,
  active,
  side,
  onHover,
  onPick,
}: {
  users: Array<UserSummary>
  active: number
  side: 'top' | 'bottom'
  onHover: (index: number) => void
  onPick: (user: UserSummary) => void
}) {
  if (users.length === 0) return null

  return (
    <ul
      role="listbox"
      aria-label="メンションの候補"
      className={`absolute left-2 z-30 w-64 max-w-[calc(100%-1rem)] overflow-hidden rounded-xl border border-border bg-surface py-1 text-sm shadow-lg ${side === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'}`}
    >
      {users.map((user, i) => (
        <li key={user.handle} role="option" aria-selected={i === active}>
          <button
            type="button"
            // textarea のフォーカスを奪わない（奪うとカーソル位置が変わる）
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => onHover(i)}
            onClick={() => onPick(user)}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left ${i === active ? 'bg-accent-soft' : ''}`}
          >
            <Avatar user={user} size="xs" />
            <span className="truncate font-bold">{user.displayName}</span>
            <span className="truncate font-mono text-xs text-text-muted">
              @{user.handle}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
