import { createFileRoute } from '@tanstack/react-router'
import { proxyOgImage } from '../lib/ogImage'

/** 部屋の共有カード（PNG）。/@:handle の og:image から参照する。 */
export const Route = createFileRoute('/og/rooms/$handle')({
  server: {
    handlers: {
      GET: ({ params, request }) =>
        proxyOgImage(
          `/api/og/rooms/${encodeURIComponent(params.handle.toLowerCase())}.png`,
          request,
        ),
    },
  },
})
