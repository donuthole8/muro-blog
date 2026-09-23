import { useMutation, useQueryClient } from '@tanstack/react-query'
import { setBlocking } from './account'

/**
 * ブロックの切り替え。ブロックするとお互いのフォローも外れるので、
 * 閲覧者ごとの情報とフォロー一覧も取り直す。
 */
export function useBlockToggle(handle: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (on: boolean) => setBlocking({ data: { handle, on } }),
    onSuccess: (result) => {
      if (!result.ok) {
        alert(result.message)
        return
      }
      void queryClient.invalidateQueries({ queryKey: ['viewer'] })
      void queryClient.invalidateQueries({ queryKey: ['blocks'] })
      void queryClient.invalidateQueries({ queryKey: ['following'] })
      void queryClient.invalidateQueries({ queryKey: ['room', handle] })
    },
  })
}

/** ブロックする前の確認文。何が起きるかを具体的に伝える。 */
export function confirmBlock(handle: string) {
  return confirm(
    `@${handle} をブロックします。\n\n` +
      '・相手はあなたの投稿に返信・リアクションできなくなります\n' +
      '・相手からの通知は届かなくなります\n' +
      '・相手の投稿はあなたの画面で折りたたまれます\n' +
      '・お互いのフォローは外れます\n\n' +
      'ブロックしたことは相手に通知されません。',
  )
}
