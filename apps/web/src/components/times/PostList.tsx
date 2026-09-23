import { Fragment, useEffect, useLayoutEffect, useRef } from 'react'
import type { TimesPost } from '@blog/api-client'
import { PostItem } from './PostItem'
import { Button } from '../Button'
import { PostListSkeleton } from '../Skeleton'
import {
  dayKey,
  formatDayLabel,
  formatGap,
  minutesBetween,
} from '../../lib/format'
import { isPendingId, useViewerState } from '../../lib/queries'

/** これ以上間が空いたら、ログの途切れとして印を出す（分） */
const GAP_MINUTES = 120

type Props = {
  posts: Array<TimesPost>
  hasNextPage: boolean
  isFetchingNextPage: boolean
  onLoadMore: () => void
  /** 投稿が1件も無いときに出す内容。EmptyState を渡す */
  empty: React.ReactNode
  /** 最初の読み込み中。データが来るまで骨組みを出す */
  isLoading?: boolean
  /** 部屋の持ち主。渡すとフォロー状態も一緒に取る */
  handle?: string
  /**
   * chat: Slack のように古い順に並べ、最新を一番下に置く（既定）。過去の投稿は上に足す。
   * feed: 新しい順（検索結果など）
   */
  order?: 'chat' | 'feed'
  /**
   * chat 表示で、初回に最新（一番下）までスクロールするか。
   * 上に案内を置いている画面（未ログインのロビー）では、案内が見えるように切る。
   */
  scrollToLatest?: boolean
}

/** SSR ではレイアウト計測ができないので、ブラウザでだけ useLayoutEffect を使う */
const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect

/**
 * 親投稿の一覧（チャンネル・部屋・タグ）。ページはカーソル方式で足していく。
 * API は新しい順に返すので、chat 表示では並びを反転して最新を一番下にする。
 */
export function PostList({
  posts,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  empty,
  isLoading = false,
  handle,
  order = 'chat',
  scrollToLatest = true,
}: Props) {
  const chat = order === 'chat'
  const items = chat ? [...posts].reverse() : posts
  const oldestId = chat ? items[0]?.id : undefined
  const newestId = chat ? items.at(-1)?.id : undefined
  const newestPending = chat && items.at(-1) && isPendingId(items.at(-1)!.id)

  // 初回表示では最新（一番下）までスクロールしておく
  const scrolledInitially = useRef(false)
  useIsomorphicLayoutEffect(() => {
    if (
      !chat ||
      !scrollToLatest ||
      scrolledInitially.current ||
      items.length === 0
    )
      return
    scrolledInitially.current = true
    const toBottom = () =>
      window.scrollTo({ top: document.documentElement.scrollHeight })
    toBottom()
    // ルーターのスクロール復元が後から先頭へ戻すことがあるので、描画後にもう一度送る
    requestAnimationFrame(toBottom)
  }, [chat, scrollToLatest, items.length])

  // 過去の投稿を上に足したとき、読んでいた位置がずれないように高さの差だけ戻す
  const heightBeforeLoad = useRef<number | null>(null)
  useIsomorphicLayoutEffect(() => {
    if (heightBeforeLoad.current === null) return
    window.scrollBy({
      top: document.documentElement.scrollHeight - heightBeforeLoad.current,
    })
    heightBeforeLoad.current = null
  }, [oldestId])

  // 自分の投稿が一番下に増えたら、そこまで送る
  useIsomorphicLayoutEffect(() => {
    if (newestPending) {
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: 'smooth',
      })
    }
  }, [newestId, newestPending])

  const loadMore = () => {
    if (chat) heightBeforeLoad.current = document.documentElement.scrollHeight
    onLoadMore()
  }

  const loadMoreButton = hasNextPage && (
    <div className="py-6 text-center">
      <Button variant="ghost" onClick={loadMore} disabled={isFetchingNextPage}>
        {isFetchingNextPage
          ? '読み込み中…'
          : chat
            ? '過去の投稿を読み込む'
            : 'もっと見る'}
      </Button>
    </div>
  )

  const viewer = useViewerState(
    posts.map((post) => post.id),
    handle,
  )
  const mine = new Map(viewer?.reactions.map((r) => [r.postId, r.emojis]))
  const blocked = new Set(viewer?.blockedHandles)

  if (posts.length === 0) {
    return isLoading ? <PostListSkeleton /> : <>{empty}</>
  }

  return (
    <div>
      {chat && loadMoreButton}
      {items.map((post, i) => {
        /*
         * ひとつ前の要素と比べて日付区切り・間の印を出す（chat なら前は古い投稿、feed なら新しい投稿）。
         * 先頭には前の要素が無いため、必ず日付区切りから始める。
         * items[i - 1] は型の上では undefined にならないので、
         * 存在確認は値ではなく添字で行う（短絡により i === 0 では触らない）。
         */
        const isFirst = i === 0
        const prev = items[i - 1]
        const startsNewDay =
          isFirst || dayKey(prev.createdAt) !== dayKey(post.createdAt)
        const gap = isFirst ? 0 : minutesBetween(prev.createdAt, post.createdAt)

        return (
          <Fragment key={post.id}>
            {startsNewDay ? (
              <DaySeparator iso={post.createdAt} />
            ) : (
              gap >= GAP_MINUTES && <GapMarker minutes={gap} />
            )}
            <PostItem
              post={post}
              myReactions={mine.get(post.id)}
              blocked={post.author != null && blocked.has(post.author.handle)}
            />
          </Fragment>
        )
      })}

      {!chat && loadMoreButton}
    </div>
  )
}

/** 日付の変わり目。ログを日単位の塊として読めるようにする。 */
function DaySeparator({ iso }: { iso: string }) {
  return (
    <div className="flex items-center gap-3 px-1 pt-6 pb-2 first:pt-0">
      <span
        className="font-mono text-xs font-bold tracking-wider text-text-muted"
        suppressHydrationWarning
      >
        {formatDayLabel(iso)}
      </span>
      <span aria-hidden className="h-px flex-1 bg-border" />
    </div>
  )
}

/**
 * 投稿と投稿の間が空いたことを示す印。
 * 分報は「書いていない時間」も情報なので、詰めずに見せる。
 */
function GapMarker({ minutes }: { minutes: number }) {
  return (
    <div className="flex items-center gap-2 py-1 pl-1 sm:gap-3">
      <span
        aria-hidden
        className="w-10 shrink-0 text-right font-mono text-[0.65rem] text-text-muted opacity-60"
      >
        ┊
      </span>
      <span className="text-[0.65rem] text-text-muted opacity-60">
        {formatGap(minutes)}
      </span>
    </div>
  )
}
