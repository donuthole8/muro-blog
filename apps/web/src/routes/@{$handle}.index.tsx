import { useEffect } from 'react'
import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { EmptyState } from '../components/EmptyState'
import { RoomHeaderSkeleton } from '../components/Skeleton'
import { ActivityStrip } from '../components/times/ActivityStrip'
import { Avatar } from '../components/times/Avatar'
import { BottomComposer } from '../components/times/ComposeModal'
import { FollowButton } from '../components/times/FollowButton'
import { PostList } from '../components/times/PostList'
import { markRoomRead } from '../lib/account'
import { confirmBlock, useBlockToggle } from '../lib/useBlockToggle'
import {
  profileQuery,
  roomPostsQuery,
  useMe,
  useViewerState,
} from '../lib/queries'
import { roomAccentStyle } from '../lib/roomColor'
import { site, roomName } from '../lib/site'

export const Route = createFileRoute('/@{$handle}/')({
  beforeLoad: ({ params }) => {
    // handle は小文字で保存しているので、正規の URL に寄せる
    if (params.handle !== params.handle.toLowerCase()) {
      throw redirect({
        to: '/@{$handle}',
        params: { handle: params.handle.toLowerCase() },
      })
    }
  },
  loader: async ({ context, params }) => {
    const [profile] = await Promise.all([
      context.queryClient.ensureQueryData(profileQuery(params.handle)),
      context.queryClient.ensureInfiniteQueryData(
        roomPostsQuery(params.handle),
      ),
    ])

    return profile
  },
  head: ({ loaderData: profile }) => {
    if (!profile) return { meta: [] }

    const title = `#${roomName(profile.handle)}（${profile.displayName}） | ${site.title}`
    const description =
      profile.bio ?? `${profile.displayName} さんの times（分報）です。`
    const url = `${site.url}/@${profile.handle}`

    return {
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:title', content: title },
        { property: 'og:type', content: 'profile' },
        { property: 'og:description', content: description },
        { property: 'og:url', content: url },
        // 部屋ごとの共有カードは描かない（Worker の無料枠では日本語フォント込みの画像生成が収まらない）
        { property: 'og:image', content: `${site.url}${site.ogImage}` },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        {
          name: 'twitter:card',
          content: profile.suspended ? 'summary' : 'summary_large_image',
        },
        ...(profile.suspended ? [{ name: 'robots', content: 'noindex' }] : []),
      ],
      links: [
        { rel: 'canonical', href: url },
        {
          rel: 'alternate',
          type: 'application/rss+xml',
          title: `${profile.displayName} の times（RSS）`,
          href: `${url}/rss.xml`,
        },
      ],
    }
  },
  component: Room,
})

function Room() {
  const { handle } = Route.useParams()
  const me = useMe()
  const queryClient = useQueryClient()
  const profile = useQuery(profileQuery(handle)).data
  const room = useInfiniteQuery(roomPostsQuery(handle))
  const posts = room.data?.pages.flatMap((page) => page.items) ?? []
  const isMine = me?.handle === handle
  const viewer = useViewerState(
    posts.map((post) => post.id),
    isMine ? undefined : handle,
  )

  // フォロー中の部屋を開いたら既読にする
  const isFollowing = viewer?.isFollowing === true
  useEffect(() => {
    if (!isFollowing) return
    void markRoomRead({ data: { handle } }).then(() =>
      queryClient.invalidateQueries({ queryKey: ['following'] }),
    )
  }, [handle, isFollowing, queryClient])

  // データが来るまで真っ白にせず、出来上がりと同じ形を出しておく
  if (!profile) return <RoomHeaderSkeleton />

  return (
    // 部屋ごとに色相を変える。配下の accent 系（枠・文字・活動グラフ）がまとめて変わり、
    // 「いま誰の部屋にいるか」が色で分かるようにする
    <div style={roomAccentStyle(handle)}>
      <header className="flex items-start gap-4 border-b border-border pb-6">
        <Avatar user={profile} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="font-mono text-xl font-bold">
              <span className="text-text-muted">#</span>
              {roomName(profile.handle)}
            </h1>
            <span className="text-sm text-text-muted">
              {profile.displayName}
            </span>
            {me?.handle &&
              !isMine &&
              viewer?.isFollowing != null &&
              !viewer.isBlocking && (
                <FollowButton
                  handle={handle}
                  isFollowing={viewer.isFollowing}
                />
              )}
            {me?.handle && !isMine && viewer?.isBlocking != null && (
              <BlockButton handle={handle} isBlocking={viewer.isBlocking} />
            )}
            {isMine && (
              <Link
                to="/settings"
                className="text-xs text-text-muted hover:text-accent"
              >
                プロフィールを編集
              </Link>
            )}
          </div>
          {profile.bio && <p className="mt-2 text-sm">{profile.bio}</p>}
          <p className="mt-2 flex flex-wrap gap-x-4 text-xs text-text-muted">
            {profile.companyName && profile.companySlug && (
              <span>
                🏢{' '}
                <Link
                  to="/org/$companySlug"
                  params={{ companySlug: profile.companySlug }}
                  className="hover:text-accent"
                >
                  {profile.companyName}
                </Link>
                <span title="所属は本人の自己申告で、確認はしていません">
                  （自己申告）
                </span>
              </span>
            )}
            <span>フォロワー {profile.followerCount}</span>
            <a
              href={`/@${profile.handle}/rss.xml`}
              className="hover:text-accent"
              title="この部屋の新着を RSS リーダーで購読する"
            >
              RSS
            </a>
          </p>
          <ActivityStrip posts={posts} />
        </div>
      </header>

      {viewer?.isBlocking && (
        <p className="mt-4 rounded-md border border-border bg-surface px-3 py-2 text-xs text-text-muted">
          この人をブロックしています。投稿は折りたたんで表示しています。
        </p>
      )}

      {profile.suspended ? (
        <EmptyState icon="🚫" title="この部屋は利用停止中です" />
      ) : (
        <>
          {/*
            スクロールしても誰の部屋にいるか分かるように、一覧の見出しを固定する。
            top はサイトヘッダーの高さぶん下げる。
          */}
          <div className="sticky top-14 z-30 -mx-4 border-b border-border bg-bg/95 px-4 py-2 backdrop-blur sm:-mx-5 sm:px-5">
            <h2 className="truncate text-xs font-bold tracking-wider text-text-muted">
              # {roomName(profile.handle)}
            </h2>
          </div>

          <PostList
            posts={posts}
            hasNextPage={room.hasNextPage}
            isFetchingNextPage={room.isFetchingNextPage}
            onLoadMore={() => void room.fetchNextPage()}
            isLoading={room.isPending}
            empty={
              isMine ? (
                <EmptyState
                  icon="✍️"
                  title="まだ何も書いていません"
                  description="下の入力欄から、いま手をつけていることをどうぞ。"
                />
              ) : (
                <EmptyState
                  icon="🫖"
                  title="まだ投稿がありません"
                  description="この部屋の主が書き始めるのを待ちましょう。"
                />
              )
            }
          />
        </>
      )}

      {isMine && <BottomComposer />}
    </div>
  )
}

function BlockButton({
  handle,
  isBlocking,
}: {
  handle: string
  isBlocking: boolean
}) {
  const toggle = useBlockToggle(handle)

  return (
    <button
      type="button"
      disabled={toggle.isPending}
      onClick={() => {
        if (isBlocking || confirmBlock(handle)) toggle.mutate(!isBlocking)
      }}
      className="text-xs text-text-muted transition-colors hover:text-danger disabled:opacity-40"
    >
      {isBlocking ? 'ブロックを解除' : 'ブロック'}
    </button>
  )
}
