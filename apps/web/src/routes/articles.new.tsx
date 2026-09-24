import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '../components/PageHeader'
import { ArticleEditor } from '../components/articles/ArticleEditor'
import type { ArticleForm } from '../components/articles/ArticleEditor'
import { createArticle } from '../lib/articles'
import { DEFAULT_EMOJI } from '../lib/emoji'
import { meQuery, myArticlesQuery } from '../lib/queries'
import { loginUrl, site } from '../lib/site'

export const Route = createFileRoute('/articles/new')({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery)
    if (!me)
      throw redirect({ href: loginUrl('/articles/new'), reloadDocument: true })
    if (!me.handle) throw redirect({ to: '/welcome' })

    return { handle: me.handle }
  },
  head: () => ({
    meta: [
      { title: `記事を書く | ${site.title}` },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: NewArticle,
})

const emptyArticle: ArticleForm = {
  title: '',
  slug: '',
  emoji: DEFAULT_EMOJI,
  bodyMd: '',
  tagSlugs: [],
  newTags: [],
}

function NewArticle() {
  const { handle } = Route.useRouteContext()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const create = useMutation({
    mutationFn: (input: Parameters<typeof createArticle>[0]['data']) =>
      createArticle({ data: input }),
    onSuccess: (result) => {
      if (!result.ok) return
      void queryClient.invalidateQueries({ queryKey: myArticlesQuery.queryKey })
      void navigate({
        to: '/articles/$id/edit',
        params: { id: String(result.article.id) },
        search: { saved: result.article.status },
        replace: true,
      })
    },
  })

  const failure = create.data && !create.data.ok ? create.data : null

  return (
    <div>
      <PageHeader title="記事を書く" />

      {failure && Object.keys(failure.errors).length === 0 && (
        <p className="mb-4 rounded-md border border-danger/40 px-3 py-2 text-sm text-danger">
          {failure.message}
        </p>
      )}

      <ArticleEditor
        initial={emptyArticle}
        status="draft"
        errors={failure?.errors ?? {}}
        isSaving={create.isPending}
        onSave={(form, status) => create.mutate({ ...form, status })}
        handle={handle}
      />
    </div>
  )
}
