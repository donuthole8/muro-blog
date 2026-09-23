import type { TimesPost } from '@blog/api-client'
import { dayKey, formatDayLabel } from '../../lib/format'

const DAYS = 14

/**
 * 部屋の活動量を日ごとの縦棒で出す。
 *
 * 「今日」を基準にすると SSR とクライアントで結果がずれるので、
 * 読み込み済みの投稿のうち最も新しい日を右端に置く。
 * 取得済みのぶんだけで描くため、追加の通信は発生しない。
 */
export function ActivityStrip({ posts }: { posts: Array<TimesPost> }) {
  if (posts.length === 0) return null

  const counts = new Map<string, number>()
  for (const post of posts) {
    const key = dayKey(post.createdAt)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  // 一覧は新しい順なので、先頭が最も新しい投稿になる
  const newestDate = new Date(posts[0].createdAt)
  const days = Array.from({ length: DAYS }, (_, i) => {
    const date = new Date(newestDate)
    date.setUTCDate(date.getUTCDate() - (DAYS - 1 - i))
    const iso = date.toISOString()

    return { iso, count: counts.get(dayKey(iso)) ?? 0 }
  })
  const max = Math.max(...days.map((day) => day.count), 1)

  return (
    <div className="mt-3">
      <div className="flex items-end gap-[3px]">
        {days.map((day) => (
          <span
            key={day.iso}
            title={`${formatDayLabel(day.iso)} ${day.count}件`}
            style={{ height: `${4 + (day.count / max) * 16}px` }}
            className={`w-1.5 rounded-[1px] ${day.count > 0 ? 'bg-accent' : 'bg-border'}`}
          />
        ))}
      </div>
      <p className="mt-1.5 font-mono text-[0.65rem] text-text-muted">
        直近 {DAYS} 日の記録
      </p>
    </div>
  )
}
