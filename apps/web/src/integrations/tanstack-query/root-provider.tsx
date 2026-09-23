import { QueryClient } from '@tanstack/react-query'
import { PUBLIC_STALE_TIME } from '../../lib/queries'

export function getContext() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // 画面表示時・タブ復帰時だけ取り直す（常時ポーリングはしない）。
        // 理由は lib/queries.ts の PUBLIC_STALE_TIME を参照。
        staleTime: PUBLIC_STALE_TIME,
        refetchOnWindowFocus: true,
      },
    },
  })

  return {
    queryClient,
  }
}
export default function TanstackQueryProvider() {}
