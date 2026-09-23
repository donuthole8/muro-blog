import { createFileRoute } from '@tanstack/react-router'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { buttonClass } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { SectionHeading } from '../components/PageHeader'
import { PostList } from '../components/times/PostList'
import { RoomCard } from '../components/times/RoomCard'
import { lobbyQuery, popularRoomsQuery, useMe } from '../lib/queries'
import { loginUrl, site } from '../lib/site'

export const Route = createFileRoute('/')({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureInfiniteQueryData(lobbyQuery),
      context.queryClient.ensureQueryData(popularRoomsQuery),
    ])
  },
  component: Lobby,
})

function Lobby() {
  const me = useMe()
  const lobby = useInfiniteQuery(lobbyQuery)
  const popular = useQuery(popularRoomsQuery)
  const posts = lobby.data?.pages.flatMap((page) => page.items) ?? []

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
        <SectionHeading>新着</SectionHeading>
        {/* 見出しと最初の日付区切りがくっつかないよう、人気の部屋と同じだけ空ける */}
        <div className="mt-3">
          <PostList
            posts={posts}
            hasNextPage={lobby.hasNextPage}
            isFetchingNextPage={lobby.isFetchingNextPage}
            onLoadMore={() => void lobby.fetchNextPage()}
            isLoading={lobby.isPending}
            scrollToLatest={me != null}
            empty={
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
            }
          />
        </div>
      </section>
    </div>
  )
}
