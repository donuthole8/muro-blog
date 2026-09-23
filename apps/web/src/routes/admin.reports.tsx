import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import type { AdminReport } from '@blog/api-client'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import {
  deletePostAsAdmin,
  dismissReport,
  listReports,
  setPostHidden,
} from '../lib/admin'
import { formatFullTime } from '../lib/format'
import { imageUrl } from '../lib/image'

const REASON_LABELS: Record<AdminReport['reason'], string> = {
  spam: 'スパム・宣伝',
  harassment: '嫌がらせ・誹謗中傷',
  privacy: '個人情報',
  illegal: '違法な内容',
  other: 'その他',
}

/**
 * 通報への対応。投稿を非表示・削除すると、その投稿への未対応の通報は
 * まとめて対応済みになる。問題がなければ却下する。
 */
export const Route = createFileRoute('/admin/reports')({
  component: AdminReports,
})

function AdminReports() {
  const [status, setStatus] = useState<'open' | 'resolved'>('open')
  const queryClient = useQueryClient()

  const reports = useInfiniteQuery({
    queryKey: ['admin', 'reports', status],
    queryFn: ({ pageParam }) =>
      listReports({ data: { status, cursor: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 0,
  })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'reports'] })
    void queryClient.invalidateQueries({ queryKey: ['admin', 'posts'] })
  }
  const onResult = (result: { ok: boolean; message?: string }) => {
    if (!result.ok && result.message) alert(result.message)
    refresh()
  }

  const hide = useMutation({
    mutationFn: (id: string) => setPostHidden({ data: { id, hidden: true } }),
    onSuccess: onResult,
  })
  const remove = useMutation({
    mutationFn: (id: string) => deletePostAsAdmin({ data: { id } }),
    onSuccess: onResult,
  })
  const dismiss = useMutation({
    mutationFn: (id: string) => dismissReport({ data: { id } }),
    onSuccess: onResult,
  })
  const busy = hide.isPending || remove.isPending || dismiss.isPending

  const items = reports.data?.pages.flatMap((page) => page.items) ?? []
  const openCount = reports.data?.pages[0]?.openCount ?? 0

  return (
    <div>
      <div className="mb-4 flex gap-2">
        {(['open', 'resolved'] as const).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={status === s ? 'primary' : 'ghost'}
            onClick={() => setStatus(s)}
          >
            {s === 'open' ? `未対応（${openCount}）` : '対応済み'}
          </Button>
        ))}
      </div>

      {reports.isSuccess && items.length === 0 && (
        <EmptyState
          icon={status === 'open' ? '✅' : '🗂'}
          title={
            status === 'open'
              ? '未対応の通報はありません'
              : '対応済みの通報はまだありません'
          }
        />
      )}

      <div className="divide-y divide-border">
        {items.map((report) => {
          const { post } = report
          const threadId = post.parentId ?? post.id
          const owner = post.author.handle

          return (
            <article key={report.id} className="space-y-2 py-4 text-sm">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
                <span className="rounded bg-danger/15 px-1.5 py-0.5 font-bold text-danger">
                  {REASON_LABELS[report.reason]}
                </span>
                <span className="text-text-muted">
                  通報者{' '}
                  {report.reporter.handle
                    ? `@${report.reporter.handle}`
                    : report.reporter.displayName}
                </span>
                <span className="text-text-muted">
                  {formatFullTime(report.createdAt)}
                </span>
                {report.resolution && (
                  <span className="text-text-muted">
                    {report.resolution === 'actioned' ? '対応済み' : '却下'}
                  </span>
                )}
              </div>
              {report.detail && (
                <p className="text-xs whitespace-pre-wrap text-text-muted">
                  「{report.detail}」
                </p>
              )}

              <div className="rounded-md border border-border bg-surface p-3">
                <div className="mb-1 flex flex-wrap gap-x-2 text-xs text-text-muted">
                  <span className="font-bold text-text">
                    {post.author.displayName}
                  </span>
                  {owner && <span>@{owner}</span>}
                  {report.postState !== 'visible' && (
                    <span className="text-danger">
                      {report.postState === 'hidden' ? '非表示中' : '削除済み'}
                    </span>
                  )}
                  {owner && report.postState !== 'deleted' && (
                    <Link
                      to="/@{$handle}/$postId"
                      params={{ handle: owner, postId: threadId }}
                      className="ml-auto hover:text-accent"
                    >
                      スレッドを開く
                    </Link>
                  )}
                </div>
                <p className="whitespace-pre-wrap">{post.bodyMarkdown}</p>
                {post.imageKey && (
                  <img
                    src={imageUrl(post.imageKey)}
                    alt=""
                    className="mt-2 max-h-48 rounded border border-border"
                  />
                )}
              </div>

              {report.resolvedAt == null && (
                <div className="flex flex-wrap gap-2">
                  {report.postState === 'visible' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => hide.mutate(post.id)}
                    >
                      投稿を非表示
                    </Button>
                  )}
                  {report.postState !== 'deleted' && (
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={busy}
                      onClick={() => {
                        if (confirm('この投稿を削除します（取り消せません）。'))
                          remove.mutate(post.id)
                      }}
                    >
                      投稿を削除
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => dismiss.mutate(report.id)}
                  >
                    問題なし（却下）
                  </Button>
                  {owner && (
                    <Link
                      to="/admin/users"
                      className="self-center text-xs text-text-muted hover:text-accent"
                    >
                      投稿者を停止する →
                    </Link>
                  )}
                </div>
              )}
            </article>
          )
        })}
      </div>

      {reports.hasNextPage && (
        <div className="py-6 text-center">
          <Button
            variant="ghost"
            size="sm"
            disabled={reports.isFetchingNextPage}
            onClick={() => void reports.fetchNextPage()}
          >
            {reports.isFetchingNextPage ? '読み込み中…' : 'もっと見る'}
          </Button>
        </div>
      )}
    </div>
  )
}
