import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import type { AdminArticle } from '@blog/api-client'
import { Button } from '../components/Button'
import { ArticleLink } from '../components/articles/ArticleLink'
import {
  deleteArticleAsAdmin,
  listModerationArticles,
  setArticleHidden,
} from '../lib/admin'
import { DEFAULT_EMOJI } from '../lib/emoji'
import { formatFullTime } from '../lib/format'

type Search = { handle?: string }

/**
 * ブログ記事の非表示・削除。下書きと非表示の記事も並ぶ。
 * 非表示は取り消せる（書き手本人には「管理者により非表示」と出る）。削除は取り消せない。
 */
export const Route = createFileRoute('/admin/articles')({
  validateSearch: (search: Record<string, unknown>): Search =>
    typeof search.handle === 'string' && search.handle !== ''
      ? { handle: search.handle }
      : {},
  component: ModerationArticles,
})

function ModerationArticles() {
  const { handle } = Route.useSearch()
  const navigate = Route.useNavigate()
  const [filter, setFilter] = useState(handle ?? '')
  const queryClient = useQueryClient()

  const articles = useInfiniteQuery({
    queryKey: ['admin', 'articles', handle ?? null],
    queryFn: ({ pageParam }) =>
      listModerationArticles({ data: { cursor: pageParam, handle } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 0,
  })

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['admin', 'articles'] })

  const hide = useMutation({
    mutationFn: (input: { id: number; hidden: boolean }) =>
      setArticleHidden({ data: input }),
    onSuccess: refresh,
  })
  const remove = useMutation({
    mutationFn: (id: number) => deleteArticleAsAdmin({ data: { id } }),
    onSuccess: refresh,
  })

  const items = articles.data?.pages.flatMap((page) => page.items) ?? []

  return (
    <div>
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

      {items.length === 0 && !articles.isPending && (
        <p className="text-sm text-text-muted">記事がありません。</p>
      )}

      <div className="divide-y divide-border">
        {items.map((article) => (
          <ArticleRow
            key={article.id}
            article={article}
            busy={hide.isPending || remove.isPending}
            onToggleHidden={() =>
              hide.mutate({ id: article.id, hidden: article.hiddenAt == null })
            }
            onDelete={() => {
              if (
                confirm(
                  `「${article.title}」を削除します。本文は元に戻せません。`,
                )
              ) {
                remove.mutate(article.id)
              }
            }}
          />
        ))}
      </div>

      {articles.hasNextPage && (
        <button
          type="button"
          onClick={() => void articles.fetchNextPage()}
          className="mt-4 text-sm text-accent hover:underline"
        >
          もっと見る
        </button>
      )}
    </div>
  )
}

function ArticleRow({
  article,
  busy,
  onToggleHidden,
  onDelete,
}: {
  article: AdminArticle
  busy: boolean
  onToggleHidden: () => void
  onDelete: () => void
}) {
  const hidden = article.hiddenAt != null
  const handle = article.author?.handle
  const visible = article.status === 'published' && !hidden

  return (
    <div className={`py-3 ${hidden ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
        {article.author ? (
          handle ? (
            <Link
              to="/@{$handle}"
              params={{ handle }}
              className="font-bold text-text"
            >
              @{handle}
            </Link>
          ) : (
            <span>（handle 未設定）</span>
          )
        ) : (
          <span>旧ブログ</span>
        )}
        {article.author?.suspendedAt && (
          <span className="text-danger">停止中</span>
        )}
        <span>{formatFullTime(article.updatedAt)} 更新</span>
        <span className="rounded border border-border px-1">
          {article.status === 'published' ? '公開' : '下書き'}
        </span>
        {hidden && (
          <span className="rounded border border-border px-1">非表示</span>
        )}

        <span className="ml-auto flex gap-3">
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
      <p className="mt-1 text-sm font-bold">
        <span aria-hidden className="mr-1.5">
          {article.emoji || DEFAULT_EMOJI}
        </span>
        {visible ? (
          <ArticleLink
            article={{
              slug: article.slug,
              author: handle ? { handle } : null,
            }}
            className="hover:text-accent"
          >
            {article.title}
          </ArticleLink>
        ) : (
          article.title
        )}
      </p>
      {article.excerpt && (
        <p className="mt-0.5 line-clamp-2 text-xs text-text-muted">
          {article.excerpt}
        </p>
      )}
    </div>
  )
}
