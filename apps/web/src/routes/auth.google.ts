import { createFileRoute } from '@tanstack/react-router'
import { getAuthApiClient } from '../lib/api'
import {
  OAUTH_STATE_COOKIE,
  RETURN_TO_COOKIE,
  serializeCookie,
} from '../lib/session'
import { safeReturnTo } from '../lib/site'

/**
 * ログインの入口。Google の同意画面へ送る。
 *
 * state（CSRF 対策）とログイン後の戻り先は、10 分だけ有効な HttpOnly Cookie に控え、
 * /auth/callback で照合する。
 */
export const Route = createFileRoute('/auth/google')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const returnTo = safeReturnTo(
          new URL(request.url).searchParams.get('returnTo'),
        )
        const { data, response } = await getAuthApiClient().fetch.GET(
          '/api/auth/google/authorize',
        )

        // Google の設定がないローカル環境では開発用ログインに回す
        if (response.status === 503 && import.meta.env.DEV) {
          return redirectTo(
            `/dev-login?returnTo=${encodeURIComponent(returnTo)}`,
          )
        }
        if (!data) {
          return new Response(
            'ログインを開始できませんでした。時間をおいて再度お試しください。',
            {
              status: 502,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            },
          )
        }

        const headers = new Headers({
          Location: data.url,
          'Cache-Control': 'no-store',
        })
        headers.append(
          'Set-Cookie',
          serializeCookie(OAUTH_STATE_COOKIE, data.state, { maxAge: 600 }),
        )
        headers.append(
          'Set-Cookie',
          serializeCookie(RETURN_TO_COOKIE, returnTo, { maxAge: 600 }),
        )

        return new Response(null, { status: 302, headers })
      },
    },
  },
})

function redirectTo(location: string) {
  return new Response(null, { status: 302, headers: { Location: location } })
}
