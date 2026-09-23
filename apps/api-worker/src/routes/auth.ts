import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import type { User } from '../db/client'
import { users } from '../db/schema'
import type { AppEnv, Bindings } from '../env'
import { accountStatusError, bearerToken, issueSession, revokeSession } from '../lib/auth'
import { ApiError, newId, notFound, now, privateCache } from '../lib/http'
import { Input } from '../lib/input'
import { normalizeHandle } from '../lib/policy'
import type { Schemas } from '../services/mapper'

/**
 * ログイン（Google OAuth の認可コードフロー）。
 *
 * ブラウザは API に直接来ない（web の Worker が中継する）ので、state の保存と照合は
 * web の Worker が Cookie で行う。ここは同意画面の URL を作るのと、認可コードを
 * Google のトークンに換えてセッションを発行するだけ。
 *
 * コールバック URL は web 側の /auth/callback。Google Cloud Console に登録したものと
 * 一字一句同じ値を GOOGLE_REDIRECT_URI に設定すること。
 */
export const auth = new Hono<AppEnv>()

const isGoogleConfigured = (env: Bindings) =>
  !!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_CLIENT_SECRET && !!env.GOOGLE_REDIRECT_URI

auth.get('/google/authorize', (c) => {
  if (!isGoogleConfigured(c.env)) {
    throw new ApiError(503, 'Google ログインが設定されていません。')
  }
  const state = [...crypto.getRandomValues(new Uint8Array(16))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.search = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: c.env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    // メールアドレスは取らない
    scope: 'openid profile',
    state,
    prompt: 'select_account',
  }).toString()

  return c.json({ url: url.toString(), state } satisfies Schemas['AuthorizationUrl'], 200, privateCache)
})

/** 認可コードをトークンに換え、Google アカウントの情報（sub・名前・アイコン）を取る。 */
async function exchangeCode(env: Bindings, code: string) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET ?? '',
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  })
  if (!response.ok) {
    throw new Error(`token endpoint returned ${response.status}: ${await response.text()}`)
  }
  const { id_token } = (await response.json()) as { id_token?: string }
  if (!id_token) throw new Error('id_token がありません')

  // トークンエンドポイントから TLS で直接受け取った ID トークンなので、署名の検証は省略できる
  // （OpenID Connect Core 3.1.3.7）
  const payload = JSON.parse(base64UrlDecode(id_token.split('.')[1] ?? '')) as {
    sub: string
    name?: string
    picture?: string
  }
  return {
    sub: String(payload.sub),
    name: payload.name || 'ななしさん',
    avatarUrl: payload.picture ?? null,
  }
}

function base64UrlDecode(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '='))
  return new TextDecoder().decode(Uint8Array.from(binary, (ch) => ch.charCodeAt(0)))
}

auth.post('/google/callback', async (c) => {
  const db = c.var.db
  const input = await Input.from(c)
  const code = input.string('code', { required: true, max: 2048 })
  input.assertValid()

  let google: Awaited<ReturnType<typeof exchangeCode>>
  try {
    google = await exchangeCode(c.env, code)
  } catch (e) {
    console.info('google oauth exchange failed', String(e))
    throw new ApiError(400, 'Google ログインに失敗しました。もう一度お試しください。')
  }

  let user = await db.select().from(users).where(eq(users.googleSub, google.sub)).get()
  if (!user) {
    user = await db
      .insert(users)
      .values({
        id: newId(),
        googleSub: google.sub,
        displayName: [...google.name].slice(0, 50).join(''),
        avatarUrl: google.avatarUrl,
        createdAt: now(),
      })
      .returning()
      .get()
  } else {
    user = await db
      .update(users)
      .set({ avatarUrl: google.avatarUrl })
      .where(eq(users.id, user.id))
      .returning()
      .get()
  }

  return c.json(await issue(c.var.db, user), 200, privateCache)
})

auth.delete('/session', async (c) => {
  const token = bearerToken(c)
  if (token !== null) await revokeSession(c.var.db, token)
  return c.body(null, 204)
})

/** 開発用ログイン（Google なしで任意の handle としてログインする）。APP_ENV=dev でしか効かない。 */
auth.post('/dev-login', async (c) => {
  if (c.env.APP_ENV !== 'dev' || c.env.DEV_LOGIN_ENABLED !== '1') throw notFound()

  const db = c.var.db
  const input = await Input.from(c)
  const raw = input.string('handle', { required: true, max: 20 })
  input.assertValid()

  const handle = normalizeHandle(raw)
  if (!/^[a-z0-9_]{3,20}$/.test(handle)) {
    throw new ApiError(422, '入力内容に誤りがあります。', {
      handle: 'handle は英小文字・数字・_ の 3〜20 文字です。',
    })
  }

  const sub = `dev:${handle}`
  const user =
    (await db.select().from(users).where(eq(users.googleSub, sub)).get()) ??
    (await db
      .insert(users)
      .values({ id: newId(), googleSub: sub, handle, displayName: handle, createdAt: now() })
      .returning()
      .get())

  return c.json(await issue(db, user), 200, privateCache)
})

async function issue(db: AppEnv['Variables']['db'], user: User): Promise<Schemas['SessionIssued']> {
  const failure = accountStatusError(user)
  if (failure) throw new ApiError(403, failure)

  const { token, expiresAt } = await issueSession(db, user)
  return { token, expiresAt, needsHandle: user.handle === null }
}
