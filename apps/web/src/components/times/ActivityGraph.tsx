import { useLayoutEffect, useRef } from 'react'
import type { Activity } from '@blog/api-client'

const WEEKS = 53
const DAY_MS = 24 * 60 * 60 * 1000

/** 件数を 5 段階の濃さにする（0 件・1 件・2〜3 件・4〜6 件・7 件以上） */
function level(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count === 0) return 0
  if (count === 1) return 1
  if (count <= 3) return 2
  if (count <= 6) return 3
  return 4
}

const LEVEL_CLASS = [
  'bg-border',
  'bg-accent/30',
  'bg-accent/55',
  'bg-accent/80',
  'bg-accent',
] as const

/** 'YYYY-MM-DD' を日付の計算用に UTC の 0 時として扱う */
const parseDay = (day: string) => new Date(`${day}T00:00:00Z`)
const formatDay = (date: Date) => date.toISOString().slice(0, 10)

/**
 * 部屋の活動グラフ（草）。直近 53 週を、日曜始まりの週ごとの列に並べる。
 * 「今日」は API が日本時間で決めて返すので、SSR とブラウザで並びがずれない。
 * 狭い画面では横にスクロールでき、最初は最新（右端）を見せる。
 */
export function ActivityGraph({ activity }: { activity: Activity }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [])

  const counts = new Map(activity.days.map((d) => [d.date, d.count]))
  const today = parseDay(activity.today)
  // 右端の列は今日を含む週。そこから 52 週さかのぼった日曜を左上にする
  const start = new Date(
    today.getTime() - (today.getUTCDay() + (WEEKS - 1) * 7) * DAY_MS,
  )

  const weeks = Array.from({ length: WEEKS }, (_week, w) =>
    Array.from({ length: 7 }, (_day, d) => {
      const date = new Date(start.getTime() + (w * 7 + d) * DAY_MS)
      const key = formatDay(date)
      return {
        key,
        count: counts.get(key) ?? 0,
        future: date.getTime() > today.getTime(),
        month: date.getUTCMonth(),
        dayOfMonth: date.getUTCDate(),
      }
    }),
  )

  return (
    <div className="mt-4">
      <div ref={scrollRef} className="overflow-x-auto pb-1">
        <div
          role="img"
          aria-label={`過去1年の投稿 ${activity.total} 件`}
          className="inline-flex flex-col gap-1"
        >
          {/* 月の見出し。その月の最初の日曜がある列に出す */}
          <div className="flex gap-[3px] font-mono text-[0.6rem] text-text-muted">
            {weeks.map((week) => (
              <span
                key={week[0].key}
                className="w-2.5 shrink-0 overflow-visible whitespace-nowrap"
              >
                {week[0].dayOfMonth <= 7 ? `${week[0].month + 1}月` : ''}
              </span>
            ))}
          </div>
          <div className="flex gap-[3px]">
            {weeks.map((week) => (
              <div key={week[0].key} className="flex flex-col gap-[3px]">
                {week.map((day) => (
                  <span
                    key={day.key}
                    title={day.future ? undefined : `${day.key} ${day.count}件`}
                    className={`h-2.5 w-2.5 rounded-[2px] ${day.future ? 'bg-transparent' : LEVEL_CLASS[level(day.count)]}`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-1.5 flex items-center gap-3 font-mono text-xs text-text-muted">
        <span>過去1年で {activity.total} 件</span>
        <span className="ml-auto flex items-center gap-[3px]" aria-hidden>
          少
          {LEVEL_CLASS.map((cls) => (
            <span key={cls} className={`h-2.5 w-2.5 rounded-[2px] ${cls}`} />
          ))}
          多
        </span>
      </div>
    </div>
  )
}
