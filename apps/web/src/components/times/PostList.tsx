import { Fragment } from 'react'
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
import { useViewerState } from '../../lib/queries'

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
}

/** 親投稿の一覧（ロビー・部屋・タグ）。ページはカーソル方式で「もっと見る」で足していく。 */
export function PostList({
  posts,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  empty,
  isLoading = false,
  handle,
}: Props) {
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
      {posts.map((post, i) => {
        /*
         * 一覧は新しい順なので、ひとつ前の要素は「これより新しい投稿」になる。
         * 先頭には前の要素が無いため、必ず日付区切りから始める。
         * posts[i - 1] は型の上では undefined にならないので、
         * 存在確認は値ではなく添字で行う（短絡により i === 0 では触らない）。
         */
        const isFirst = i === 0
        const newer = posts[i - 1]
        const startsNewDay =
          isFirst || dayKey(newer.createdAt) !== dayKey(post.createdAt)
        const gap = isFirst
          ? 0
          : minutesBetween(newer.createdAt, post.createdAt)

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

      {hasNextPage && (
        <div className="py-6 text-center">
          <Button
            variant="ghost"
            onClick={onLoadMore}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? '読み込み中…' : 'もっと見る'}
          </Button>
        </div>
      )}
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
