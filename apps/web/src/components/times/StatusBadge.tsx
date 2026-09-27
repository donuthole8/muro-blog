import type { UserStatus } from '@blog/api-client'

/**
 * 今の状態（作業中・集中など）。一覧では絵文字だけ、部屋の見出しでは文言も出す。
 * 期限切れのものは API が null にして返すので、ここでは時刻を見ない（SSR とずれないように）。
 */
export function StatusBadge({
  status,
  withText = false,
}: {
  status?: UserStatus | null
  withText?: boolean
}) {
  if (!status) return null

  if (!withText) {
    return (
      <span
        title={status.text || undefined}
        aria-label={status.text ? `状態: ${status.text}` : undefined}
        className="text-sm leading-none"
      >
        {status.emoji}
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-xs">
      <span aria-hidden>{status.emoji}</span>
      {status.text && <span>{status.text}</span>}
    </span>
  )
}
