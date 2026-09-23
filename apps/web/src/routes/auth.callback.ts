import { createFileRoute } from '@tanstack/react-router'
import { getAuthApiClient } from '../lib/api'
import {
  OAUTH_STATE_COOKIE,
  RETURN_TO_COOKIE,
  SESSION_COOKIE,
  readCookieFrom,
  safeReturnTo,
  serializeCookie,
} from '../lib/session'

/**
 * Google からの戻り先。state を照合してから認可コードを API に渡し、
 * 受け取ったセッショントークンを HttpOnly Cookie に入れる。
 */
export const Route = createFileRoute('/auth/callback')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const code = url.searchParams.get('code')
        const state = url.searchParams.get('state')
        const expectedState = readCookieFrom(request, OAUTH_STATE_COOKIE)
        const returnTo = safeReturnTo(readCookieFrom(request, RETURN_TO_COOKIE))

        if (url.searchParams.get('error')) {
          // 同意画面でキャンセルされた
          return finish('/', [])
        }
        if (!code || !state || !expectedState || state !== expectedState) {
          return errorPage(
            'ログインの確認に失敗しました。もう一度ログインしてください。',
          )
        }

        const { data: session, error } = await getAuthApiClient().fetch.POST(
          '/api/auth/google/callback',
          { body: { code } },
        )
        if (!session) {
          return errorPage(
            (error as { message?: string } | undefined)?.message ??
              'ログインに失敗しました。',
          )
        }

        return finish(session.needsHandle ? '/welcome' : returnTo, [
          serializeCookie(SESSION_COOKIE, session.token, {
            expires: new Date(session.expiresAt),
          }),
        ])
      },
    },
  },
})

function finish(location: string, cookies: Array<string>) {
  const headers = new Headers({
    Location: location,
    'Cache-Control': 'no-store',
  })
  for (const cookie of cookies) headers.append('Set-Cookie', cookie)
  // 使い終わった state と戻り先を消す
  headers.append(
    'Set-Cookie',
    serializeCookie(OAUTH_STATE_COOKIE, '', { maxAge: 0 }),
  )
  headers.append(
    'Set-Cookie',
    serializeCookie(RETURN_TO_COOKIE, '', { maxAge: 0 }),
  )

  return new Response(null, { status: 302, headers })
}

function errorPage(message: string) {
  const escaped = message.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)

  return new Response(
    `<!doctype html><meta charset="utf-8"><title>ログインエラー</title>
<body style="font-family:system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem">
<p>${escaped}</p><p><a href="/">トップへ戻る</a></p></body>`,
    {
      status: 400,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    },
  )
}
