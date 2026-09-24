import {
  Link,
  createFileRoute,
  notFound,
  redirect,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ArticleSource } from '@blog/api-client'
import { Button } from '../components/Button'
import { PageHeader } from '../components/PageHeader'
import { ArticleEditor } from '../components/articles/ArticleEditor'
import { ArticleLink } from '../components/articles/ArticleLink'
import { useOpenCompose } from '../components/times/ComposeModal'
import { deleteArticle, fetchMyArticle, updateArticle } from '../lib/articles'
import { meQuery, myArticlesQuery } from '../lib/queries'
import { loginUrl, site } from '../lib/site'

type EditSearch = {
  /** 保存した直後に、保存した状態を出す（新規作成からの遷移用） */
  saved?: ArticleSource['status']
}

export const Route = createFileRoute('/articles/$id/edit')({
  validateSearch: (search: Record<string, unknown>): EditSearch =>
    search.saved === 'draft' || search.saved === 'published'
      ? { saved: search.saved }
      : {},
  beforeLoad: async ({ context, params }) => {
    const me = await context.queryClient.ensureQueryData(meQuery)
    if (!me)
      throw redirect({
        href: loginUrl(`/articles/${params.id}/edit`),
        reloadDocument: true,
      })
    if (!me.handle) throw redirect({ to: '/welcome' })

    return { handle: me.handle }
  },
  loader: async ({ params }) => {
    const id = Number(params.id)
    const article = Number.isSafeInteger(id)
      ? await fetchMyArticle({ data: { id } })
      : null
    if (!article) throw notFound()

    return article
  },
  head: () => ({
    meta: [
      { title: `記事を編集 | ${site.title}` },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: EditArticle,
})

function EditArticle() {
  const article = Route.useLoaderData()
  const { handle } = Route.useRouteContext()
  const { saved } = Route.useSearch()
  const router = useRouter()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const openCompose = useOpenCompose()

  const save = useMutation({
    mutationFn: (
      input: Parameters<typeof updateArticle>[0]['data']['article'],
    ) => updateArticle({ data: { id: article.id, article: input } }),
    onSuccess: async (result) => {
      if (!result.ok) return
      void queryClient.invalidateQueries({ queryKey: myArticlesQuery.queryKey })
      await navigate({
        to: '.',
        search: { saved: result.article.status },
        replace: true,
      })
      await router.invalidate()
    },
  })

  const remove = useMutation({
    mutationFn: () => deleteArticle({ data: { id: article.id } }),
    onSuccess: (result) => {
      if (!result.ok) return
      void queryClient.invalidateQueries({ queryKey: myArticlesQuery.queryKey })
      void navigate({ to: '/articles' })
    },
  })

  const failure = save.data && !save.data.ok ? save.data : null
  const published = article.status === 'published'
  const card = {
    id: article.id,
    slug: article.slug,
    title: article.title,
    emoji: article.emoji,
    excerpt: article.excerpt,
    author: { handle, displayName: handle },
  }

  return (
    <div>
      <PageHeader title="記事を編集">
        <Link
          to="/articles"
          className="ml-auto text-xs text-text-muted hover:text-accent"
        >
          自分の記事一覧
        </Link>
      </PageHeader>

      {failure && Object.keys(failure.errors).length === 0 && (
        <p className="mb-4 rounded-md border border-danger/40 px-3 py-2 text-sm text-danger">
          {failure.message}
        </p>
      )}

      {saved && !save.isPending && !failure && (
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-accent/40 bg-accent-soft px-3 py-2 text-sm text-accent">
          {saved === 'published' ? '公開しました。' : '下書きを保存しました。'}
          {published && (
            <>
              <ArticleLink article={card} className="underline">
                記事を見る
              </ArticleLink>
              <Button size="sm" onClick={() => openCompose({ article: card })}>
                times で共有する
              </Button>
            </>
          )}
        </div>
      )}

      <ArticleEditor
        // 保存後に loader が返す最新値で内部 state を作り直す
        key={article.updatedAt}
        initial={{
          title: article.title,
          slug: article.slug,
          emoji: article.emoji ?? null,
          bodyMd: article.bodyMd,
          tagSlugs: article.tags.map((tag) => tag.slug),
          newTags: [],
        }}
        status={article.status}
        errors={failure?.errors ?? {}}
        isSaving={save.isPending}
        onSave={(form, status) => save.mutate({ ...form, status })}
        handle={handle}
        ogImageKey={article.ogImageKey}
        hidden={article.hiddenAt != null}
      >
        <button
          type="button"
          disabled={remove.isPending}
          onClick={() => {
            if (confirm('この記事を削除します。よろしいですか？')) {
              remove.mutate()
            }
          }}
          className="ml-auto text-xs text-text-muted transition-colors hover:text-danger disabled:opacity-40"
        >
          記事を削除
        </button>
      </ArticleEditor>
    </div>
  )
}
