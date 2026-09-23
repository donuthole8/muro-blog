import { sql } from 'drizzle-orm'
import type { Db, User } from '../db/client'
import { rateLimits } from '../db/schema'
import { ApiError } from './http'

/**
 * 書き込み系（とログイン試行）のユーザー単位のレート制限（固定窓）。超えたら 429 と Retry-After を返す。
 *
 * 連投や画像の連続アップロードは R2 と D1 の無料枠を直接削るので、ユーザー単位で絞る。
 * 登録から 24 時間以内のアカウントは厳しい方の上限を使う（捨てアカウント対策）。
 */
const LIMITS = {
  post: { label: '投稿', window: 10 * 60, limit: 30, newLimit: 10 },
  image_upload: { label: '画像のアップロード', window: 60 * 60, limit: 30, newLimit: 5 },
  reaction: { label: 'リアクション', window: 10 * 60, limit: 120, newLimit: 40 },
  report: { label: '通報', window: 24 * 60 * 60, limit: 20, newLimit: 5 },
  /** メールアドレス単位。パスワードの総当たり対策 */
  login: { label: 'ログインの試行', window: 15 * 60, limit: 10, newLimit: 10 },
} as const

export type RateLimitedAction = keyof typeof LIMITS

const NEW_ACCOUNT_SECONDS = 24 * 60 * 60

/** subject はユーザー、またはログイン前の操作ならその対象を表す文字列（メールアドレスなど）。 */
export async function consumeRateLimit(db: Db, action: RateLimitedAction, subject: User | string) {
  const rule = LIMITS[action]
  const nowSec = Math.floor(Date.now() / 1000)
  const isNew =
    typeof subject !== 'string' && subject.createdAt.getTime() / 1000 > nowSec - NEW_ACCOUNT_SECONDS
  const subjectKey = typeof subject === 'string' ? subject : subject.id
  const limit = isNew ? rule.newLimit : rule.limit
  const windowStart = nowSec - (nowSec % rule.window)
  const expiresAt = windowStart + rule.window

  const row = await db
    .insert(rateLimits)
    .values({ key: `${action}:${subjectKey}:${windowStart}`, count: 1, expiresAt })
    .onConflictDoUpdate({ target: rateLimits.key, set: { count: sql`${rateLimits.count} + 1` } })
    .returning({ count: rateLimits.count })
    .get()

  // 古い窓の行はたまに掃除する（毎回だと書き込みが増えるので間引く）
  if (Math.random() < 0.02) {
    await db.delete(rateLimits).where(sql`${rateLimits.expiresAt} < ${nowSec}`)
  }

  if (row.count <= limit) return

  const retryAfter = Math.max(1, expiresAt - nowSec)
  throw new ApiError(
    429,
    `${rule.label}の回数が上限に達しました。${humanize(retryAfter)}ほど待ってからもう一度お試しください。`,
    {},
    { 'Retry-After': String(retryAfter) },
  )
}

function humanize(seconds: number): string {
  if (seconds < 60) return `${seconds} 秒`
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} 分`
  return `${Math.ceil(seconds / 3600)} 時間`
}
