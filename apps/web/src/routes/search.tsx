import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { Avatar } from '../components/times/Avatar'
import { PostList } from '../components/times/PostList'
import { searchQuery } from '../lib/queries'
import { site } from '../lib/site'

type Search = { q?: string }

/** 投稿本文と部屋（handle・表示名）の検索。?q= を URL に持つので結果を共有できる。 */
export const Route = createFileRoute('/search')({
  validateSearch: (search: Record<string, unknown>): Search =>
    typeof search.q === 'string' && search.q.trim() !== ''
      ? { q: search.q.trim() }
      : {},
  loaderDeps: ({ search }) => ({ q: search.q ?? '' }),
  loader: async ({ context, deps }) => {
    if (deps.q !== '') {
      await context.queryClient.ensureInfiniteQueryData(searchQuery(deps.q))
    }
  },
  head: ({ match }) => ({
    meta: [
      {
        title: match.search.q
          ? `「${match.search.q}」の検索結果 | ${site.title}`
          : `検索 | ${site.title}`,
      },
      // 検索結果のページは無数にできるので、検索エンジンには載せない
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: SearchPage,
})

function SearchPage() {
  const { q = '' } = Route.useSearch()
  const navigate = Route.useNavigate()
  const [input, setInput] = useState(q)
  const query = useInfiniteQuery(searchQuery(q))
  const users = query.data?.pages[0]?.users ?? []
  const posts = query.data?.pages.flatMap((page) => page.items) ?? []

  return (
    <div>
      <PageHeader title="検索" />

      <form
        role="search"
        className="mb-6 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void navigate({ search: input.trim() ? { q: input.trim() } : {} })
        }}
      >
        <input
          type="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="投稿の本文、handle、名前で検索"
          aria-label="検索語"
          autoFocus={q === ''}
          maxLength={100}
          className="min-h-11 flex-1 rounded-md border border-border bg-surface px-3 text-sm"
        />
        <Button type="submit">検索</Button>
      </form>

      {q === '' ? (
        <EmptyState
          icon="🔍"
          title="キーワードを入れてください"
          description="空白で区切ると、すべての語を含む投稿に絞り込みます。"
        />
      ) : (
        <>
          {users.length > 0 && (
            <section className="mb-8">
              <h2 className="text-xs font-bold tracking-wider text-text-muted">
                部屋
              </h2>
              <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {users.map((user) => (
                  <li key={user.handle}>
                    <Link
                      to="/@{$handle}"
                      params={{ handle: user.handle }}
                      className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 transition-colors hover:border-accent"
                    >
                      <Avatar user={user} />
                      <span className="min-w-0 truncate text-sm font-bold">
                        {user.displayName}
                        <span className="ml-1.5 text-xs font-normal text-text-muted">
                          @{user.handle}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h2 className="text-xs font-bold tracking-wider text-text-muted">
              投稿
            </h2>
            <PostList
              order="feed"
              posts={posts}
              hasNextPage={query.hasNextPage}
              isFetchingNextPage={query.isFetchingNextPage}
              onLoadMore={() => void query.fetchNextPage()}
              isLoading={query.isPending}
              empty={
                <EmptyState
                  icon="🫥"
                  title={`「${q}」を含む投稿は見つかりませんでした`}
                  description="別の言葉や、短いキーワードで試してみてください。"
                />
              }
            />
          </section>
        </>
      )}
    </div>
  )
}
