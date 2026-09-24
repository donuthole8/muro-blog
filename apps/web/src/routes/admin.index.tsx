import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import type { AdminPost } from '@blog/api-client'
import { Button } from '../components/Button'
import {
  deletePostAsAdmin,
  listModerationPosts,
  moderateBacklog,
  remoderatePost,
  setPostHidden,
} from '../lib/admin'
import { formatFullTime } from '../lib/format'
import { imageUrl } from '../lib/image'

type Search = { handle?: string }

/**
 * 投稿の非表示・削除。削除依頼への対応のため、非表示の投稿も本文ごと見える。
 * 非表示は取り消せる。削除は本文と画像を消すので取り消せない。
 */
export const Route = createFileRoute('/admin/')({
  validateSearch: (search: Record<string, unknown>): Search =>
    typeof search.handle === 'string' && search.handle !== ''
      ? { handle: search.handle }
      : {},
  component: ModerationPosts,
})

function ModerationPosts() {
  const { handle } = Route.useSearch()
  const navigate = Route.useNavigate()
  const [filter, setFilter] = useState(handle ?? '')
  const queryClient = useQueryClient()
  const queryKey = ['admin', 'posts', handle ?? null]

  const posts = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      listModerationPosts({ data: { cursor: pageParam, handle } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 0,
  })

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['admin', 'posts'] })

  const hide = useMutation({
    mutationFn: (input: { id: string; hidden: boolean }) =>
      setPostHidden({ data: input }),
    onSuccess: refresh,
  })
  const remove = useMutation({
    mutationFn: (id: string) => deletePostAsAdmin({ data: { id } }),
    onSuccess: refresh,
  })
  const remoderate = useMutation({
    mutationFn: (id: string) => remoderatePost({ data: { id } }),
    onSuccess: (result) => {
      if (!result.ok) alert(result.message)
      return refresh()
    },
  })

  const items = posts.data?.pages.flatMap((page) => page.items) ?? []

  return (
    <div>
      <BacklogModeration onDone={refresh} />

      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void navigate({ search: filter ? { handle: filter } : {} })
        }}
      >
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="handle で絞り込む"
          className="flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
        />
        <Button type="submit" variant="ghost">
          絞り込む
        </Button>
      </form>

      {items.length === 0 && !posts.isPending && (
        <p className="text-sm text-text-muted">投稿がありません。</p>
      )}

      <div className="divide-y divide-border">
        {items.map((post) => (
          <ModerationRow
            key={post.id}
            post={post}
            busy={hide.isPending || remove.isPending || remoderate.isPending}
            onRemoderate={() => remoderate.mutate(post.id)}
            onToggleHidden={() =>
              hide.mutate({ id: post.id, hidden: post.hiddenAt == null })
            }
            onDelete={() => {
              if (
                confirm('この投稿を削除します。本文と画像は元に戻せません。')
              ) {
                remove.mutate(post.id)
              }
            }}
          />
        ))}
      </div>

      {posts.hasNextPage && (
        <button
          type="button"
          onClick={() => void posts.fetchNextPage()}
          className="mt-4 text-sm text-accent hover:underline"
        >
          もっと見る
        </button>
      )}
    </div>
  )
}

const MODERATION_CATEGORIES: Record<string, string> = {
  sexual: '性的',
  violence: '暴力的',
  harassment: '誹謗中傷',
  legal: '法的リスク',
}

/**
 * Jev 導入前の投稿や、判定に失敗した投稿を遡って判定する。
 * API は1回に数十件しか処理しないので、残りが無くなるか Jev が失敗するまで繰り返し呼ぶ。
 */
function BacklogModeration({ onDone }: { onDone: () => void }) {
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const run = async () => {
    setRunning(true)
    let processed = 0
    let blocked = 0
    let sensitive = 0
    try {
      for (;;) {
        const res = await moderateBacklog()
        if (!res.ok) {
          setStatus(res.message)
          break
        }
        const r = res.result
        processed += r.processed
        blocked += r.blocked
        sensitive += r.sensitive
        const summary = `${processed} 件を判定（自動非表示 ${blocked} / 要注意 ${sensitive}）。残り ${r.remaining} 件`
        if (r.stopped) {
          setStatus(
            `${summary}。Jev の呼び出しに失敗したため止めました（クレジット切れの可能性があります）`,
          )
          break
        }
        setStatus(summary)
        if (r.remaining === 0 || r.processed === 0) break
      }
    } finally {
      setRunning(false)
      onDone()
    }
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-text-muted">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={running}
        onClick={() => void run()}
      >
        {running ? '判定中…' : '未判定の投稿を判定する'}
      </Button>
      {status && <span>{status}</span>}
    </div>
  )
}

function ModerationRow({
  post,
  busy,
  onRemoderate,
  onToggleHidden,
  onDelete,
}: {
  post: AdminPost
  busy: boolean
  /** 今の設定で Jev に判定し直させる */
  onRemoderate: () => void
  onToggleHidden: () => void
  onDelete: () => void
}) {
  const hidden = post.hiddenAt != null

  return (
    <div className={`py-3 ${hidden ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
        {post.author.handle ? (
          <Link
            to="/@{$handle}"
            params={{ handle: post.author.handle }}
            className="font-bold text-text"
          >
            @{post.author.handle}
          </Link>
        ) : (
          <span>（handle 未設定）</span>
        )}
        {post.author.suspendedAt && <span className="text-danger">停止中</span>}
        <span>{formatFullTime(post.createdAt)}</span>
        {post.parentId && <span>返信</span>}
        {hidden && (
          <span className="rounded border border-border px-1">非表示</span>
        )}
        {post.moderation && (
          <span
            className="rounded border border-danger px-1 text-danger"
            title="Jev による判定"
          >
            {post.moderation === 'blocked' ? '自動非表示' : '要注意'}
            {post.moderationCategory &&
              `: ${MODERATION_CATEGORIES[post.moderationCategory] ?? post.moderationCategory}`}
            {post.moderationScore != null &&
              ` ${Math.round(post.moderationScore * 100)}%`}
          </span>
        )}
        {!post.moderation && post.moderationScore != null && (
          <span
            className="rounded border border-border px-1"
            title="Jev による判定"
          >
            問題なし {Math.round(post.moderationScore * 100)}%
          </span>
        )}

        <span className="ml-auto flex gap-3">
          {post.bodyMarkdown !== '' && (
            <button
              type="button"
              disabled={busy}
              onClick={onRemoderate}
              className="hover:text-accent disabled:opacity-40"
            >
              再判定
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={onToggleHidden}
            className="hover:text-accent disabled:opacity-40"
          >
            {hidden ? '非表示を解除' : '非表示にする'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onDelete}
            className="hover:text-danger disabled:opacity-40"
          >
            削除
          </button>
        </span>
      </div>
      <p className="mt-1 text-sm whitespace-pre-wrap">{post.bodyMarkdown}</p>
      {post.imageKey && (
        <img
          src={imageUrl(post.imageKey)}
          alt=""
          className="mt-1 max-h-32 rounded border border-border"
        />
      )}
    </div>
  )
}
