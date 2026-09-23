import { createFileRoute } from '@tanstack/react-router'
import { proxyOgImage } from '../lib/ogImage'

/**
 * スレッドの共有カード（PNG）。/@:handle/:postId の og:image から参照する。
 * 編集後は og:image 側で ?v= を変えるので、クエリはここでは使わない。
 */
export const Route = createFileRoute('/og/threads/$postId')({
  server: {
    handlers: {
      GET: ({ params, request }) =>
        proxyOgImage(
          `/api/og/threads/${encodeURIComponent(params.postId)}.png`,
          request,
        ),
    },
  },
})
