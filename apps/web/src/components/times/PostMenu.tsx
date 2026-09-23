import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import type { ReportInput, TimesPost } from '@blog/api-client'
import { Popover } from './Popover'
import { Button } from '../Button'
import { reportPost } from '../../lib/account'
import { confirmBlock, useBlockToggle } from '../../lib/useBlockToggle'

type Reason = NonNullable<ReportInput['reason']>

const REASONS: Array<{ value: Reason; label: string }> = [
  { value: 'spam', label: 'スパム・宣伝' },
  { value: 'harassment', label: '嫌がらせ・誹謗中傷' },
  { value: 'privacy', label: '個人情報の掲載' },
  { value: 'illegal', label: '違法な内容' },
  { value: 'other', label: 'その他' },
]

/** 他人の投稿のメニュー（通報・ブロック）。ログイン中で部屋を持っている人にだけ出す。 */
export function PostMenu({ post }: { post: TimesPost }) {
  const [reporting, setReporting] = useState(false)
  const handle = post.author?.handle
  const block = useBlockToggle(handle ?? '')

  return (
    <span className="ml-auto">
      <Popover
        align="right"
        trigger={({ toggle }) => (
          <button
            type="button"
            onClick={toggle}
            aria-label="投稿のメニュー"
            className="inline-flex min-h-8 items-center rounded-md px-1.5 text-xs text-text-muted transition-colors hover:text-accent"
          >
            …
          </button>
        )}
      >
        {(close) =>
          reporting ? (
            <ReportForm
              post={post}
              onDone={() => {
                setReporting(false)
                close()
              }}
            />
          ) : (
            <div className="w-44 overflow-hidden rounded-xl border border-border bg-surface py-1 text-xs shadow-lg">
              <button
                type="button"
                onClick={() => setReporting(true)}
                className="block w-full px-4 py-2 text-left transition-colors hover:bg-accent-soft"
              >
                この投稿を通報する
              </button>
              {handle && (
                <button
                  type="button"
                  disabled={block.isPending}
                  onClick={() => {
                    close()
                    if (confirmBlock(handle)) block.mutate(true)
                  }}
                  className="block w-full px-4 py-2 text-left text-danger transition-colors hover:bg-accent-soft"
                >
                  @{handle} をブロック
                </button>
              )}
            </div>
          )
        }
      </Popover>
    </span>
  )
}

function ReportForm({ post, onDone }: { post: TimesPost; onDone: () => void }) {
  const [reason, setReason] = useState<Reason>('spam')
  const [detail, setDetail] = useState('')

  const submit = useMutation({
    mutationFn: () =>
      reportPost({
        data: { id: post.id, report: { reason, detail: detail || null } },
      }),
    onSuccess: (result) => {
      if (!result.ok) return
      alert('通報しました。運営が内容を確認します。')
      onDone()
    },
  })
  const failure = submit.data && !submit.data.ok ? submit.data : null

  return (
    <form
      className="w-72 space-y-2 rounded-xl border border-border bg-surface p-3 text-xs shadow-lg"
      onSubmit={(e) => {
        e.preventDefault()
        submit.mutate()
      }}
    >
      <p className="font-bold">この投稿を通報する</p>
      <fieldset className="space-y-1">
        {REASONS.map((r) => (
          <label key={r.value} className="flex items-center gap-2">
            <input
              type="radio"
              name="reason"
              value={r.value}
              checked={reason === r.value}
              onChange={() => setReason(r.value)}
            />
            {r.label}
          </label>
        ))}
      </fieldset>
      <textarea
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        maxLength={500}
        rows={3}
        placeholder="詳細（任意）"
        className="w-full rounded-md border border-border bg-surface px-2 py-1.5"
      />
      {failure && (
        <p className="text-danger">
          {Object.values(failure.errors)[0] ?? failure.message}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={submit.isPending}>
          {submit.isPending ? '送信中…' : '通報する'}
        </Button>
        <button
          type="button"
          onClick={onDone}
          className="inline-flex min-h-9 items-center rounded-md px-2 text-text-muted transition-colors hover:text-accent"
        >
          キャンセル
        </button>
      </div>
    </form>
  )
}
