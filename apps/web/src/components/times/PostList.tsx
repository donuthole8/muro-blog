import type { TimesPost } from '@blog/api-client'
import { PostItem } from './PostItem'
import { Button } from '../Button'
import { PostListSkeleton } from '../Skeleton'
import { useViewerState } from '../../lib/queries'

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
      {posts.map((post) => (
        <PostItem
          key={post.id}
          post={post}
          myReactions={mine.get(post.id)}
          blocked={post.author != null && blocked.has(post.author.handle)}
        />
      ))}

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
