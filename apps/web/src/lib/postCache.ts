import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import type {
  ArticleCard,
  Me,
  PostPage,
  TagSummary,
  Thread,
  TimesPost,
  ViewerState,
} from '@blog/api-client'

/**
 * 自分の操作を、サーバーの応答を待たずに画面へ反映する（楽観的更新）ための
 * キャッシュ操作。同じ投稿がロビー・部屋・タグ・スレッドの複数のキャッシュに
 * 載っているので、まとめて書き換える。
 */

type PageList = InfiniteData<{
  items: Array<TimesPost>
  nextCursor?: string | null
}>

const isPageList = (data: unknown): data is PageList =>
  typeof data === 'object' && data !== null && 'pages' in data

const isThread = (data: unknown): data is Thread =>
  typeof data === 'object' && data !== null && 'replies' in data

/** 投稿が載りうる全キャッシュ（ロビー・部屋・タグ・スレッド） */
const postCaches = {
  predicate: ({ queryKey }: { queryKey: ReadonlyArray<unknown> }) =>
    ['lobby', 'room', 'tag', 'thread'].includes(String(queryKey[0])),
}

/** id の投稿を書き換える（null を返すと取り除く）。 */
export function updatePostEverywhere(
  queryClient: QueryClient,
  id: string,
  update: (post: TimesPost) => TimesPost | null,
) {
  queryClient.setQueriesData(postCaches, (data: unknown) => {
    if (isPageList(data)) {
      return {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          items: page.items.flatMap((post) => {
            if (post.id !== id) return [post]
            const next = update(post)
            return next ? [next] : []
          }),
        })),
      }
    }

    if (isThread(data)) {
      const post = data.post.id === id ? update(data.post) : data.post
      return {
        post: post ?? data.post,
        replies: data.replies.flatMap((reply) => {
          if (reply.id !== id) return [reply]
          const next = update(reply)
          return next ? [next] : []
        }),
      }
    }

    return data
  })
}

/** 新しい親投稿をロビーと自分の部屋の先頭に差し込む。 */
export function prependParentPost(
  queryClient: QueryClient,
  handle: string,
  post: TimesPost,
) {
  for (const queryKey of [['lobby'], ['room', handle, 'posts']]) {
    queryClient.setQueryData<InfiniteData<PostPage>>(queryKey, (data) => {
      if (!data || data.pages.length === 0) return data
      const [first, ...rest] = data.pages
      return {
        ...data,
        pages: [{ ...first, items: [post, ...first.items] }, ...rest],
      }
    })
  }
}

/** スレッドに返信を足し、親投稿の返信数を増やす。 */
export function appendReply(
  queryClient: QueryClient,
  parentId: string,
  reply: TimesPost,
) {
  queryClient.setQueryData<Thread>(['thread', parentId], (data) =>
    data ? { ...data, replies: [...data.replies, reply] } : data,
  )
  updatePostEverywhere(queryClient, parentId, (post) => ({
    ...post,
    replyCount: post.replyCount + 1,
    lastReplyAt: reply.createdAt,
  }))
}

/** 楽観的に差し込んだ仮の投稿を、保存された本物に置き換える。 */
export function replacePost(
  queryClient: QueryClient,
  pendingId: string,
  saved: TimesPost,
) {
  updatePostEverywhere(queryClient, pendingId, () => saved)
}

/** リアクションの付け外しを、公開データ（件数）と閲覧者の状態の両方に反映する。 */
export function applyReaction(
  queryClient: QueryClient,
  postId: string,
  emoji: string,
  on: boolean,
) {
  updatePostEverywhere(queryClient, postId, (post) => {
    const delta = on ? 1 : -1
    const exists = post.reactions.some((r) => r.emoji === emoji)
    const reactions = exists
      ? post.reactions
          .map((r) =>
            r.emoji === emoji ? { ...r, count: r.count + delta } : r,
          )
          .filter((r) => r.count > 0)
      : on
        ? [...post.reactions, { emoji, count: 1 }]
        : post.reactions

    return {
      ...post,
      reactions,
      reactionCount: Math.max(0, post.reactionCount + delta),
    }
  })

  queryClient.setQueriesData<ViewerState | null>(
    { queryKey: ['viewer'] },
    (state) => {
      if (!state) return state
      const current =
        state.reactions.find((r) => r.postId === postId)?.emojis ?? []
      const emojis = on
        ? [...new Set([...current, emoji])]
        : current.filter((e) => e !== emoji)

      return {
        ...state,
        reactions: [
          ...state.reactions.filter((r) => r.postId !== postId),
          { postId, emojis },
        ],
      }
    },
  )
}

/** サーバーに送る前の仮の投稿。本文はエスケープしただけのプレーンテキストで見せる。 */
export function pendingPost(
  me: Me,
  input: {
    bodyMarkdown: string
    parentId?: string | null
    imageKey?: string | null
    tags?: Array<TagSummary>
    article?: ArticleCard | null
  },
): TimesPost {
  return {
    id: `pending-${crypto.randomUUID()}`,
    parentId: input.parentId ?? null,
    author: {
      handle: me.handle ?? '',
      displayName: me.displayName,
      avatarUrl: me.avatarUrl ?? null,
    },
    state: 'visible',
    bodyHtml: plainTextToHtml(input.bodyMarkdown),
    imageKey: input.imageKey ?? null,
    replyCount: 0,
    reactionCount: 0,
    reactions: [],
    tags: input.tags ?? [],
    article: input.article ?? null,
    lastReplyAt: null,
    editedAt: null,
    createdAt: new Date().toISOString(),
  }
}

function plainTextToHtml(text: string): string {
  if (text.trim() === '') return ''
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

  return `<p>${escaped.replace(/\n/g, '<br>')}</p>`
}
