import { Link, createFileRoute } from '@tanstack/react-router'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { buttonClass } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { SectionHeading } from '../components/PageHeader'
import { PostList } from '../components/times/PostList'
import { RoomCard } from '../components/times/RoomCard'
import {
  feedQuery,
  lobbyQuery,
  meQuery,
  popularRoomsQuery,
  useMe,
} from '../lib/queries'
import { loginUrl, site } from '../lib/site'
import { absoluteUrl, canonical, jsonLd } from '../lib/seo'

type View = 'all' | 'following'

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): { view?: View } =>
    search.view === 'following' ? { view: 'following' } : {},
  loaderDeps: ({ search }) => ({ view: search.view }),
  loader: async ({ context, deps }) => {
    const me = context.queryClient.getQueryData(meQuery.queryKey)
    await Promise.all([
      deps.view === 'following' && me?.handle
        ? context.queryClient.ensureInfiniteQueryData(feedQuery)
        : context.queryClient.ensureInfiniteQueryData(lobbyQuery),
      context.queryClient.ensureQueryData(popularRoomsQuery),
    ])
  },
  head: () => ({
    meta: [
      { property: 'og:url', content: canonical('/').href },
      jsonLd({
        '@type': 'WebSite',
        name: site.title,
        url: absoluteUrl('/'),
        description: site.description,
        inLanguage: 'ja',
        potentialAction: {
          '@type': 'SearchAction',
          target: `${absoluteUrl('/search')}?q={search_term_string}`,
          'query-input': 'required name=search_term_string',
        },
      }),
    ],
    links: [canonical('/')],
  }),
  component: Lobby,
})

function Lobby() {
  const me = useMe()
  const { view: requested } = Route.useSearch()
  // フォロー中は人ごとの一覧なので、部屋を持っている人だけが選べる
  const view: View =
    requested === 'following' && me?.handle ? 'following' : 'all'
  const lobby = useInfiniteQuery({
    ...lobbyQuery,
    enabled: view === 'all',
  })
  const feed = useInfiniteQuery({ ...feedQuery, enabled: view === 'following' })
  const current = view === 'all' ? lobby : feed
  const popular = useQuery(popularRoomsQuery)
  const posts = current.data?.pages.flatMap((page) => page.items) ?? []

  return (
    <div className="space-y-8">
      {/* 見出しの並びを正しく保つための、画面には出さないページ名 */}
      <h1 className="sr-only">チャンネル</h1>

      {!me && (
        <section className="rounded-xl border border-border bg-surface p-5">
          <p className="text-lg font-bold">自分だけの times を持とう</p>
          <p className="mt-1 text-sm text-text-muted">{site.description}</p>
          <a href={loginUrl()} className={buttonClass({ className: 'mt-4' })}>
            Google で始める
          </a>
        </section>
      )}

      {(popular.data?.length ?? 0) > 0 && (
        <section>
          <SectionHeading>人気の部屋（24時間）</SectionHeading>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {popular.data?.slice(0, 6).map((room) => (
              <RoomCard key={room.user.handle} room={room} />
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="flex items-center gap-4">
          <SectionHeading>新着</SectionHeading>
          {me?.handle && (
            <nav
              aria-label="表示する投稿"
              className="ml-auto flex gap-1 rounded-full border border-border p-0.5 text-xs"
            >
              <ViewTab view="all" current={view}>
                すべて
              </ViewTab>
              <ViewTab view="following" current={view}>
                フォロー中
              </ViewTab>
            </nav>
          )}
        </div>
        {/* 見出しと最初の日付区切りがくっつかないよう、人気の部屋と同じだけ空ける */}
        <div className="mt-3">
          <PostList
            key={view}
            posts={posts}
            hasNextPage={current.hasNextPage}
            isFetchingNextPage={current.isFetchingNextPage}
            onLoadMore={() => void current.fetchNextPage()}
            isLoading={current.isPending}
            scrollToLatest={me != null}
            empty={
              view === 'following' ? (
                <EmptyState
                  icon="👀"
                  title="フォロー中の部屋にまだ投稿がありません"
                  description="気になる部屋をフォローすると、その人の投稿だけがここに並びます。"
                />
              ) : (
                <EmptyState
                  icon="🌱"
                  title="まだ投稿がありません"
                  description="いちばん最初のひとことを書くと、ここに流れます。"
                  action={
                    me?.handle ? undefined : (
                      <a
                        href={loginUrl()}
                        className={buttonClass({ size: 'sm' })}
                      >
                        Google で始める
                      </a>
                    )
                  }
                />
              )
            }
          />
        </div>
      </section>
    </div>
  )
}

function ViewTab({
  view,
  current,
  children,
}: {
  view: View
  current: View
  children: React.ReactNode
}) {
  const active = view === current
  return (
    <Link
      to="/"
      search={view === 'all' ? {} : { view }}
      aria-current={active ? 'page' : undefined}
      className={`inline-flex min-h-8 items-center rounded-full px-3 transition-colors ${active ? 'bg-accent text-bg' : 'text-text-muted hover:text-accent'}`}
    >
      {children}
    </Link>
  )
}
