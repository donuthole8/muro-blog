import { Link, createFileRoute } from '@tanstack/react-router'
import { ArchivedPostCard } from '../components/ArchivedPostCard'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { Pagination } from '../components/Pagination'
import { fetchUserArticles } from '../lib/articles'
import { useMe } from '../lib/queries'
import { roomName, site } from '../lib/site'

type ArticlesSearch = { page?: number }

export const Route = createFileRoute('/@{$handle}/articles/')({
  validateSearch: (search: Record<string, unknown>): ArticlesSearch => {
    const page = Number(search.page)
    return Number.isFinite(page) && page > 1 ? { page } : {}
  },
  loaderDeps: ({ search }) => ({ page: search.page ?? 1 }),
  loader: ({ params, deps }) =>
    fetchUserArticles({ data: { handle: params.handle, page: deps.page } }),
  head: ({ params }) => ({
    meta: [
      { title: `@${params.handle} の記事 | ${site.title}` },
      {
        name: 'description',
        content: `${roomName(params.handle)} の書き手のブログ記事です。`,
      },
    ],
    links: [
      { rel: 'canonical', href: `${site.url}/@${params.handle}/articles` },
    ],
  }),
  component: UserArticles,
})

function UserArticles() {
  const articles = Route.useLoaderData()
  const { handle } = Route.useParams()
  const { page = 1 } = Route.useSearch()
  const me = useMe()

  return (
    <div>
      <PageHeader
        title={`@${handle} の記事`}
        description={
          <>
            {articles.total} 件 ・{' '}
            <Link
              to="/@{$handle}"
              params={{ handle }}
              className="hover:text-accent"
            >
              #{roomName(handle)} へ
            </Link>
          </>
        }
      >
        {me?.handle === handle && (
          <Link
            to="/articles"
            className="ml-auto text-xs text-text-muted hover:text-accent"
          >
            自分の記事を管理
          </Link>
        )}
      </PageHeader>

      {articles.items.length === 0 ? (
        <EmptyState icon="📝" title="まだ公開された記事がありません" />
      ) : (
        <div>
          {articles.items.map((post) => (
            <ArchivedPostCard key={post.id} post={post} />
          ))}
        </div>
      )}

      <Pagination currentPage={page} totalPages={articles.totalPages} />
    </div>
  )
}
