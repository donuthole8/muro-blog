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
}

export type AppEnv = {
  Bindings: Bindings
  Variables: {
    db: Db
    /** Bearer トークンで認証できたユーザー。未ログインなら null */
    user: User | null
  }
}
