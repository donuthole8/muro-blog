import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import type { TimesPost } from '@blog/api-client'
import { PostListSkeleton } from '../components/Skeleton'
import { BottomComposer } from '../components/times/ComposeModal'
import { PostItem } from '../components/times/PostItem'
import { htmlExcerpt } from '../lib/format'
import { threadQuery, useViewerState } from '../lib/queries'
import { roomAccentStyle } from '../lib/roomColor'
import { site } from '../lib/site'

export const Route = createFileRoute('/@{$handle}/$postId')({
  loader: async ({ context, params }) => {
    const thread = await context.queryClient.ensureQueryData(
      threadQuery(params.postId),
    )

    // URL の handle が持ち主と違えば正規の URL に寄せる
    const owner = thread.post.author?.handle
    if (owner && owner !== params.handle) {
      throw redirect({
        to: '/@{$handle}/$postId',
        params: { handle: owner, postId: params.postId },
      })
    }

    return thread
  },
  head: ({ loaderData: thread, params }) => {
    if (!thread) return { meta: [] }

    const { post } = thread
    const author = post.author
    const excerpt =
      post.state === 'visible' ? htmlExcerpt(post.bodyHtml, 120) : ''
    const title = author
      ? `${author.displayName}: ${excerpt.slice(0, 40) || 'スレッド'} | ${site.title}`
      : `スレッド | ${site.title}`
    const url = `${site.url}/@${params.handle}/${post.id}`
    // 画像付きの投稿はその画像を、なければ本文を描いた共有カードを出す。
    // カードはエッジで1日キャッシュされるので、編集したら ?v= を変えて取り直させる
    const card =
      post.state === 'visible' && author
        ? `${site.url}/og/threads/${post.id}?v=${encodeURIComponent(post.editedAt ?? post.createdAt)}`
        : undefined
    const image = post.imageKey ? `${site.url}/uploads/${post.imageKey}` : card

    return {
      meta: [
        { title },
        { name: 'description', content: excerpt },
        { property: 'og:title', content: title },
        { property: 'og:type', content: 'article' },
        { property: 'og:description', content: excerpt },
        { property: 'og:url', content: url },
        ...(image ? [{ property: 'og:image', content: image }] : []),
        {
          name: 'twitter:card',
          content: image ? 'summary_large_image' : 'summary',
        },
        { property: 'article:published_time', content: post.createdAt },
      ],
      links: [{ rel: 'canonical', href: url }],
    }
  },
  component: ThreadPage,
})

function ThreadPage() {
  const { postId } = Route.useParams()
  const thread = useQuery(threadQuery(postId)).data
  const viewer = useViewerState(
    thread ? [thread.post.id, ...thread.replies.map((reply) => reply.id)] : [],
  )
  const mine = new Map(viewer?.reactions.map((r) => [r.postId, r.emojis]))
  const blocked = new Set(viewer?.blockedHandles)
  const isBlocked = (post: TimesPost) =>
    post.author != null && blocked.has(post.author.handle)

  if (!thread) return <PostListSkeleton rows={3} />

  const canReply = thread.post.state === 'visible'
  // 退会したユーザーのスレッドは持ち主がいない。URL の handle は解放済みで
  // 別の人が取っている可能性があるので、部屋へのリンクは出さない
  const owner = thread.post.author?.handle

  return (
    // スレッドは部屋の中にあるので、その部屋の色をそのまま引き継ぐ。
    // 持ち主がいない（退会済み）スレッドだけ既定色のままにする
    <div style={owner ? roomAccentStyle(owner) : undefined}>
      {owner ? (
        <Link
          to="/@{$handle}"
          params={{ handle: owner }}
          className="inline-flex min-h-9 items-center rounded-md text-xs text-text-muted transition-colors hover:text-accent"
        >
          ← @{owner} の部屋
        </Link>
      ) : (
        <Link
          to="/"
          className="inline-flex min-h-9 items-center rounded-md text-xs text-text-muted transition-colors hover:text-accent"
        >
          ← 新着へ
        </Link>
      )}

      <div className="mt-2">
        <PostItem
          post={thread.post}
          myReactions={mine.get(thread.post.id)}
          variant="thread"
          blocked={isBlocked(thread.post)}
        />
      </div>

      <h2 className="mt-6 text-xs font-bold tracking-wider text-text-muted">
        {thread.replies.length > 0
          ? `${thread.replies.length}件の返信`
          : 'まだ返信はありません'}
      </h2>
      <div className="border-l-2 border-border pl-4">
        {thread.replies.map((reply) => (
          <PostItem
            key={reply.id}
            post={reply}
            myReactions={mine.get(reply.id)}
            variant="reply"
            blocked={isBlocked(reply)}
          />
        ))}
      </div>

      {canReply && <BottomComposer parentId={thread.post.id} />}
    </div>
  )
}
