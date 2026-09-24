import type { Db, User } from './db/client'

/** wrangler.jsonc の vars・secrets・バインディング。 */
export type Bindings = {
  DB: D1Database
  APP_ENV: string
  SITE_HOST: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET?: string
  GOOGLE_REDIRECT_URI: string
  DEV_LOGIN_ENABLED?: string
  /** TypeSafe（Jev）の API キー。無ければ投稿の不適切さを判定しない */
  TYPESAFE_API_KEY?: string
}

export type AppEnv = {
  Bindings: Bindings
  Variables: {
    db: Db
    /** Bearer トークンで認証できたユーザー。未ログインなら null */
    user: User | null
  }
}
