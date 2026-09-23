import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ViewerState } from '@blog/api-client'
import { setFollowing } from '../../lib/account'

type Props = {
  handle: string
  isFollowing: boolean
}

export function FollowButton({ handle, isFollowing }: Props) {
  const queryClient = useQueryClient()

  const toggle = useMutation({
    mutationFn: (on: boolean) => setFollowing({ data: { handle, on } }),
    onMutate: (on) => setFollowState(on),
    onSuccess: (result, on) => {
      if (!result.ok) setFollowState(!on)
      void queryClient.invalidateQueries({ queryKey: ['following'] })
    },
    onError: (_error, on) => setFollowState(!on),
  })

  function setFollowState(on: boolean) {
    queryClient.setQueriesData<ViewerState | null>(
      { queryKey: ['viewer'] },
      (state) =>
        state && state.isFollowing != null
          ? { ...state, isFollowing: on }
          : state,
    )
  }

  return (
    <button
      type="button"
      onClick={() => toggle.mutate(!isFollowing)}
      disabled={toggle.isPending}
      className={
        // Button の sm と同じ寸法。解除は危険な操作なので hover で danger に寄せる
        isFollowing
          ? 'inline-flex min-h-9 items-center rounded-md border border-border px-3 text-xs font-bold text-text-muted transition-colors hover:border-danger hover:text-danger'
          : 'inline-flex min-h-9 items-center rounded-md bg-accent px-3 text-xs font-bold text-bg transition-colors hover:opacity-90'
      }
    >
      {isFollowing ? 'フォロー中' : 'フォローする'}
    </button>
  )
}
