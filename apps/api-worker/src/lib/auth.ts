import { and, eq, gt, lte } from 'drizzle-orm'
import { createMiddleware } from 'hono/factory'
import type { Context } from 'hono'
import type { Db, User } from '../db/client'
import { sessions, users } from '../db/schema'
import type { AppEnv } from '../env'
import { ApiError, forbidden, iso, now } from './http'

/**
 * ログインセッション。トークンは乱数で作り、DB には SHA-256 だけを残す
 * （DB が漏れてもそのままセッションを乗っ取れないように）。
 * web の Worker がトークンを HttpOnly Cookie に入れ、API を呼ぶときに Bearer で渡す。
 */
const SESSION_LIFETIME_SECONDS = 30 * 24 * 60 * 60

async function sha256(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export async function issueSession(db: Db, user: User) {
  // 期限切れのセッションはログインのたびについでに掃除する（専用のバッチは作らない）
  await db.delete(sessions).where(lte(sessions.expiresAt, now()))

  const token = randomToken()
  const expiresAt = new Date(now().getTime() + SESSION_LIFETIME_SECONDS * 1000)
  await db.insert(sessions).values({
    tokenHash: await sha256(token),
    userId: user.id,
    expiresAt,
  })

  return { token, expiresAt: iso(expiresAt) }
}

export async function revokeSession(db: Db, token: string) {
  await db.delete(sessions).where(eq(sessions.tokenHash, await sha256(token)))
}

/** 停止・退会時に全端末からログアウトさせる。 */
export async function revokeAllSessions(db: Db, userId: string) {
  await db.delete(sessions).where(eq(sessions.userId, userId))
}

export function bearerToken(c: Context): string | null {
  const header = c.req.header('Authorization') ?? ''
  return header.startsWith('Bearer ') ? header.slice(7) : null
}

/**
 * Authorization: Bearer のトークンからログインユーザーを引く。
 * トークンが付いているのに通らない（期限切れ・停止・退会）ときは、公開 API でも 401 を返す
 * （web はそれを見て Cookie を捨てる）。
 */
export const authenticate = createMiddleware<AppEnv>(async (c, next) => {
  const token = bearerToken(c)
  if (token === null) {
    c.set('user', null)
    return next()
  }

  const row = await c.var.db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, await sha256(token)), gt(sessions.expiresAt, now())))
    .get()

  if (!row) {
    throw new ApiError(401, 'ログインの有効期限が切れました。もう一度ログインしてください。')
  }
  const failure = accountStatusError(row.user)
  if (failure) throw new ApiError(401, failure)

  c.set('user', row.user)
  return next()
})

/** 退会・停止中なら、そのメッセージ。 */
export function accountStatusError(user: User): string | null {
  if (user.deletedAt) return 'このアカウントは退会済みです。'
  if (user.suspendedAt) return 'このアカウントは利用を停止されています。'
  return null
}

/** ログイン必須。 */
export function currentUser(c: Context<AppEnv>): User {
  const user = c.var.user
  if (!user) throw new ApiError(401, 'ログインが必要です。')
  return user
}

/** ログイン済みで、handle を決め終えている（投稿・リアクションなどができる）。 */
export function activeUser(c: Context<AppEnv>): User & { handle: string } {
  const user = currentUser(c)
  if (user.handle === null) throw forbidden('先に handle を決めてください。')
  return user as User & { handle: string }
}

/** /api/admin/* の入口。 */
export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (currentUser(c).role !== 'admin') throw forbidden()
  return next()
})
