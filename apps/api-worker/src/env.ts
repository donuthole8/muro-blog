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
  /** サイトの URL（メールに載せるリンクに使う）。無ければ https://SITE_HOST */
  SITE_URL?: string
  /** メール送信（Brevo）の API キー。無ければ送らず、開発時はリンクをログに出す */
  BREVO_API_KEY?: string
  /** 送信元のメールアドレス（Brevo で確認済みの送信者） */
  MAIL_FROM?: string
  /** Web Push の VAPID 鍵（base64url）。無ければプッシュ通知を送らない */
  VAPID_PUBLIC_KEY?: string
  VAPID_PRIVATE_KEY?: string
  /** VAPID の連絡先（mailto: か https:）。プッシュサービスが問題のあるときに連絡してくる */
  VAPID_SUBJECT?: string
}

export type AppEnv = {
  Bindings: Bindings
  Variables: {
    db: Db
    /** Bearer トークンで認証できたユーザー。未ログインなら null */
    user: User | null
  }
}
