import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Me } from '@blog/api-client'
import { Button } from '../Button'
import { EmojiPalette } from './EmojiPalette'
import { Popover } from './Popover'
import { StatusBadge } from './StatusBadge'
import { setStatus } from '../../lib/account'
import { meQuery } from '../../lib/queries'

/** よく使う状態。押すとそのまま設定する */
const PRESETS: Array<{ emoji: string; text: string }> = [
  { emoji: '💻', text: '作業中' },
  { emoji: '🎯', text: '集中' },
  { emoji: '🫖', text: 'もくもく中' },
  { emoji: '🍵', text: '休憩中' },
  { emoji: '🚶', text: '離席中' },
  { emoji: '🌙', text: '今日はおしまい' },
]

/** 期限の選択肢（分）。null は期限なし */
const DURATIONS: Array<{ label: string; minutes: number | null }> = [
  { label: '30分', minutes: 30 },
  { label: '1時間', minutes: 60 },
  { label: '4時間', minutes: 4 * 60 },
  { label: '今日中', minutes: -1 },
  { label: '期限なし', minutes: null },
]

/** 「今日中」を、日本時間の今日の終わりまでの分数にする */
function minutesUntilEndOfDayJst(): number {
  const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const minutesToday = jstNow.getUTCHours() * 60 + jstNow.getUTCMinutes()
  return Math.max(1, 24 * 60 - minutesToday)
}

/**
 * 今の状態を決める。定番から選ぶか、絵文字と一言を自分で入れる。
 * 期限を過ぎると自動で消える（API 側で出さなくなる）。
 */
export function StatusEditor({ me }: { me: Me }) {
  const queryClient = useQueryClient()
  const [emoji, setEmoji] = useState(me.status?.emoji ?? '💻')
  const [text, setText] = useState(me.status?.text ?? '')
  const [duration, setDuration] = useState<number | null>(60)

  const save = useMutation({
    mutationFn: (status: { emoji: string; text: string } | null) =>
      setStatus({
        data: {
          status: status && {
            ...status,
            text: status.text || null,
            expiresInMinutes:
              duration === -1 ? minutesUntilEndOfDayJst() : duration,
          },
        },
      }),
    onSuccess: (result) => {
      if (!result.ok) return
      queryClient.setQueryData(meQuery.queryKey, result.me)
      if (result.me.handle) {
        void queryClient.invalidateQueries({
          queryKey: ['room', result.me.handle],
        })
      }
    },
  })
  const failure = save.data && !save.data.ok ? save.data : null

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
        いま:{' '}
        {me.status ? (
          <>
            <StatusBadge status={me.status} withText />
            <button
              type="button"
              disabled={save.isPending}
              onClick={() => save.mutate(null)}
              className="underline hover:text-accent"
            >
              消す
            </button>
          </>
        ) : (
          '未設定'
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => (
          <button
            key={preset.text}
            type="button"
            disabled={save.isPending}
            onClick={() => {
              setEmoji(preset.emoji)
              setText(preset.text)
              save.mutate(preset)
            }}
            className="inline-flex min-h-8 items-center gap-1 rounded-full border border-border px-2.5 text-xs transition-colors hover:border-accent hover:text-accent"
          >
            <span aria-hidden>{preset.emoji}</span>
            {preset.text}
          </button>
        ))}
      </div>

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate({ emoji, text })
        }}
      >
        <Popover
          trigger={({ toggle }) => (
            <button
              type="button"
              onClick={toggle}
              aria-label="絵文字を選ぶ"
              className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-lg"
            >
              {emoji}
            </button>
          )}
        >
          {(close) => (
            <EmojiPalette
              onPick={(picked) => {
                setEmoji(picked)
                close()
              }}
            />
          )}
        </Popover>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={40}
          placeholder="ひとこと（任意）"
          className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm"
        />
        <select
          value={duration ?? 'none'}
          onChange={(e) =>
            setDuration(
              e.target.value === 'none' ? null : Number(e.target.value),
            )
          }
          aria-label="状態を消すまでの時間"
          className="rounded-md border border-border bg-surface px-2 py-2 text-sm"
        >
          {DURATIONS.map((d) => (
            <option key={d.label} value={d.minutes ?? 'none'}>
              {d.label}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" disabled={save.isPending}>
          設定
        </Button>
      </form>
      {failure && (
        <p className="text-xs text-danger">
          {Object.values(failure.errors)[0] ?? failure.message}
        </p>
      )}
    </div>
  )
}
