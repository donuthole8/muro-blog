import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { MyArticle } from '@blog/api-client'
import { buttonClass } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { ArticleLink } from '../components/articles/ArticleLink'
import { deleteArticle } from '../lib/articles'
import { DEFAULT_EMOJI } from '../lib/emoji'
import { formatDate } from '../lib/format'
import { meQuery, myArticlesQuery } from '../lib/queries'
import { loginUrl, site } from '../lib/site'

export const Route = createFileRoute('/articles/')({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery)
    if (!me)
      throw redirect({ href: loginUrl('/articles'), reloadDocument: true })
    if (!me.handle) throw redirect({ to: '/welcome' })

    return { me: { ...me, handle: me.handle } }
  },
  head: () => ({
    meta: [
      { title: `自分の記事 | ${site.title}` },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: MyArticles,
})

function MyArticles() {
  const { me } = Route.useRouteContext()
  const articles = useQuery(myArticlesQuery)
  const items = articles.data ?? []

  return (
    <div>
      <PageHeader
        title="自分の記事"
        description={
          <>
            公開した記事は{' '}
            <Link
              to="/@{$handle}/articles"
              params={{ handle: me.handle }}
              className="text-accent hover:underline"
            >
              /@{me.handle}/articles
            </Link>{' '}
            に並びます。
          </>
        }
      >
        <Link
          to="/articles/new"
          className={`${buttonClass({ size: 'sm' })} ml-auto`}
        >
          記事を書く
        </Link>
      </PageHeader>

      {articles.isPending ? (
        <p className="text-sm text-text-muted">読み込み中…</p>
      ) : items.length === 0 ? (
        <EmptyState
          icon="📝"
          title="まだ記事がありません"
          description="分報より長く書きたいことは、記事にまとめておけます。"
          action={
            <Link to="/articles/new" className={buttonClass({ size: 'sm' })}>
              最初の記事を書く
            </Link>
          }
        />
      ) : (
        <ul className="divide-y divide-border">
          {items.map((article) => (
            <Row
              key={article.id}
              article={article}
              handle={me.handle}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function Row({ article, handle }: { article: MyArticle; handle: string }) {
  const queryClient = useQueryClient()
  const remove = useMutation({
    mutationFn: () => deleteArticle({ data: { id: article.id } }),
    onSuccess: (result) => {
      if (!result.ok) {
        alert(result.message)
        return
      }
      void queryClient.invalidateQueries({ queryKey: myArticlesQuery.queryKey })
    },
  })
  const published = article.status === 'published'

  return (
    <li className="flex items-center gap-3 py-3">
      <span
        aria-hidden
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent-soft text-xl"
      >
        {article.emoji || DEFAULT_EMOJI}
      </span>
      <div className="min-w-0 flex-1">
        <Link
          to="/articles/$id/edit"
          params={{ id: String(article.id) }}
          className="block truncate font-bold hover:text-accent"
        >
          {article.title}
        </Link>
        <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-text-muted">
          <span className={published ? 'text-accent' : undefined}>
            {published ? '公開中' : '下書き'}
          </span>
          <span className="font-mono">{formatDate(article.updatedAt)} 更新</span>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1 text-xs">
        {published && (
          <ArticleLink
            article={{ slug: article.slug, author: { handle } }}
            className="inline-flex min-h-8 items-center rounded-md px-1.5 text-text-muted hover:text-accent"
          >
            見る
          </ArticleLink>
        )}
        <Link
          to="/articles/$id/edit"
          params={{ id: String(article.id) }}
          className="inline-flex min-h-8 items-center rounded-md px-1.5 text-text-muted hover:text-accent"
        >
          編集
        </Link>
        <button
          type="button"
          disabled={remove.isPending}
          onClick={() => {
            if (confirm(`「${article.title}」を削除します。よろしいですか？`)) {
              remove.mutate()
            }
          }}
          className="inline-flex min-h-8 items-center rounded-md px-1.5 text-text-muted hover:text-danger disabled:opacity-40"
        >
          削除
        </button>
      </div>
    </li>
  )
}
