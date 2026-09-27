import { useMutation, useQueryClient } from '@tanstack/react-query'
import { setMuting } from './account'

/**
 * ミュートの切り替え。ブロックと違い相手には何も起きず、自分の一覧から見えなくなり、
 * その人からの通知が止まるだけ。
 */
export function useMuteToggle(handle: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (on: boolean) => setMuting({ data: { handle, on } }),
    onSuccess: (result) => {
      if (!result.ok) {
        alert(result.message)
        return
      }
      void queryClient.invalidateQueries({ queryKey: ['viewer'] })
      void queryClient.invalidateQueries({ queryKey: ['mutes'] })
    },
  })
}
