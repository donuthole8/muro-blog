import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { TimesPost } from '@blog/api-client'
import { deletePost, setReaction, updatePost } from './account'
import { applyReaction, updatePostEverywhere } from './postCache'

/**
 * 投稿への操作（リアクション・編集・削除）。いずれも画面へ先に反映し、
 * 失敗したら元に戻す。
 */
export function usePostActions() {
  const queryClient = useQueryClient()

  const react = useMutation({
    mutationFn: (input: { postId: string; emoji: string; on: boolean }) =>
      setReaction({ data: input }),
    onMutate: ({ postId, emoji, on }) =>
      applyReaction(queryClient, postId, emoji, on),
    onSuccess: (result, { postId, emoji, on }) => {
      if (result.ok) return
      applyReaction(queryClient, postId, emoji, !on)
      // 回数の上限・ブロックは理由を伝えないと「押せない」ように見える
      if (result.status === 429 || result.status === 403) alert(result.message)
    },
    onError: (_error, { postId, emoji, on }) =>
      applyReaction(queryClient, postId, emoji, !on),
  })

  const edit = useMutation({
    mutationFn: (input: {
      post: TimesPost
      bodyMarkdown: string
      tagSlugs: Array<string>
    }) =>
      updatePost({
        data: {
          id: input.post.id,
          post: { bodyMarkdown: input.bodyMarkdown, tagSlugs: input.tagSlugs },
        },
      }),
    onSuccess: (result) => {
      if (result.ok) {
        updatePostEverywhere(queryClient, result.post.id, () => result.post)
      }
    },
  })

  const remove = useMutation({
    mutationFn: (post: TimesPost) => deletePost({ data: { id: post.id } }),
    onMutate: (post) => {
      // 返信が付いた親投稿は「削除されました」として残し、それ以外は一覧から消す
      updatePostEverywhere(queryClient, post.id, (current) =>
        current.replyCount > 0 && !current.parentId
          ? {
              ...current,
              state: 'deleted',
              bodyHtml: '',
              imageKey: null,
              tags: [],
              reactions: [],
            }
          : null,
      )
      if (post.parentId) {
        updatePostEverywhere(queryClient, post.parentId, (parent) => ({
          ...parent,
          replyCount: Math.max(0, parent.replyCount - 1),
        }))
      }
    },
    onSettled: (result, _error, post) => {
      if (!result?.ok) {
        // 失敗したら取り直して元に戻す
        void queryClient.invalidateQueries({
          predicate: ({ queryKey }) =>
            ['lobby', 'room', 'tag', 'thread'].includes(String(queryKey[0])),
        })
        alert(result?.message ?? `削除に失敗しました（${post.id}）`)
      }
    },
  })

  return { react, edit, remove }
}
