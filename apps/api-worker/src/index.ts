import { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { createDb } from './db/client'
import type { AppEnv } from './env'
import { authenticate } from './lib/auth'
import { ApiError, errorBody } from './lib/http'
import { admin } from './routes/admin'
import { archive } from './routes/archive'
import { articles } from './routes/articles'
import { auth } from './routes/auth'
import { dev } from './routes/dev'
import { discover } from './routes/discover'
import { me } from './routes/me'
import { postRoutes } from './routes/posts'
import { social } from './routes/social'

/**
 * times の API（Symfony 版 apps/api の置き換え）。
 *
 * ブラウザからは直接呼ばれない。web の Worker が Service Binding 経由で呼び、
 * ログイン中は Cookie のセッショントークンを Authorization: Bearer に載せ替えて渡す。
 * 応答の形は packages/api-client/openapi.json（schema.d.ts）に従う。
 */
const app = new Hono<AppEnv>().basePath('/api')

app.use(async (c, next) => {
  c.set('db', createDb(c.env.DB))
  await next()
})
app.use(authenticate)

app.route('/', discover)
app.route('/', social)
app.route('/', articles)
app.route('/posts', postRoutes)
app.route('/me', me)
app.route('/auth', auth)
app.route('/archive', archive)
app.route('/admin', admin)
app.route('/dev', dev)

app.notFound((c) => c.json(errorBody('リソースが見つかりません。'), 404))

app.onError((err, c) => {
  if (err instanceof ApiError) {
    return c.json(
      errorBody(err.message, err.errors),
      err.status as ContentfulStatusCode,
      err.headers,
    )
  }
  console.error(err)
  return c.json(errorBody('サーバーでエラーが発生しました。'), 500)
})

export default app
