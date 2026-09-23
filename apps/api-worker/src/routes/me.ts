import { and, asc, count, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { Hono } from 'hono'
import type { Db, User } from '../db/client'
import { blocks, follows, notifications, posts, reactions, sessions, users } from '../db/schema'
import type { AppEnv } from '../env'
import { activeUser, currentUser } from '../lib/auth'
import { ApiError, invalid, isUlid, now, privateCache } from '../lib/http'
import { Input } from '../lib/input'
import { companySlug, handleViolation, normalizeHandle } from '../lib/policy'
import { consumeRateLimit } from '../lib/rateLimit'
import { toMe, type Schemas } from '../services/mapper'
import { inChunks } from '../services/posts'
import { findBlockedHandles, findFollow, findRoomOwner, findUserByHandle, isBlocking } from '../services/users'
import { deletePostStatements } from '../services/writer'

export const me = new Hono<AppEnv>()

export async function countUnread(db: Db, userId: string): Promise<number> {
  const row = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .get()
  return row?.n ?? 0
}

async function meResponse(db: Db, user: User) {
  return toMe(user, await countUnread(db, user.id))
}

me.get('/', async (c) => {
  const user = currentUser(c)
  return c.json(await meResponse(c.var.db, user), 200, privateCache)
})

me.put('/', async (c) => {
  const db = c.var.db
  const user = currentUser(c)
  const input = await Input.from(c)
  const rawHandle = input.optionalString('handle')
  const displayName = input.string('displayName', {
    required: true,
    requiredMessage: '表示名は必須です。',
    max: 50,
  })
  const bio = input.optionalString('bio', { max: 300 })
  const companyName = input.optionalString('companyName', { max: 100 })
  input.assertValid()

  let handle = user.handle
  if (handle === null) {
    // handle は初回だけ決められる
    const next = normalizeHandle(rawHandle ?? '')
    const violation = handleViolation(next)
    if (violation) throw invalid('handle', violation)
    if (await findUserByHandle(db, next)) {
      throw new ApiError(409, 'この handle は既に使われています。', {
        handle: 'この handle は既に使われています。',
      })
    }
    handle = next
  } else if (rawHandle !== null && normalizeHandle(rawHandle) !== handle) {
    throw invalid('handle', 'handle は後から変更できません。')
  }

  const company = companyName?.trim() ?? ''
  const updated = await db
    .update(users)
    .set({
      handle,
      displayName: displayName.trim(),
      bio: bio?.trim() || null,
      companyName: company === '' ? null : company,
      companySlug: company === '' ? null : companySlug(company),
    })
    .where(eq(users.id, user.id))
    .returning()
    .get()

  return c.json(await meResponse(db, updated), 200, privateCache)
})

/**
 * 退会（データ削除）。仕様は docs/PLAN.md §11「退会したユーザーの投稿の扱い」。
 *
 * - 投稿はすべて論理削除して本文・画像を消す。親投稿の行は残し、他人の返信は残す
 * - 付けたリアクション・フォロー・ブロック・通知・セッションは行ごと消す
 * - 退会者が出した通報は、管理上の記録として残す
 * - ユーザーの行は残すが、Google の ID・handle・プロフィールは消す
 *
 * 返り値は R2 から消すべき画像のキー（API からは R2 に触れないので web の Worker が消す）。
 */
me.delete('/', async (c) => {
  const db = c.var.db
  const user = currentUser(c)

  const own = await db
    .select()
    .from(posts)
    .where(and(eq(posts.authorId, user.id), isNull(posts.deletedAt)))
  const imageKeys = own.flatMap((p) => (p.imageKey ? [p.imageKey] : []))

  // リアクションを消す投稿の件数を先に控えておき、消した後で数え直す
  const reacted = await db
    .selectDistinct({ postId: reactions.postId })
    .from(reactions)
    .where(eq(reactions.userId, user.id))

  const statements: BatchItem<'sqlite'>[] = own.flatMap((p) => deletePostStatements(db, p))
  statements.push(
    db.delete(reactions).where(eq(reactions.userId, user.id)),
    db.delete(notifications).where(or(eq(notifications.userId, user.id), eq(notifications.actorId, user.id))),
    db.delete(follows).where(or(eq(follows.followerId, user.id), eq(follows.followeeId, user.id))),
    db.delete(blocks).where(or(eq(blocks.blockerId, user.id), eq(blocks.blockedId, user.id))),
    db.delete(sessions).where(eq(sessions.userId, user.id)),
    db
      .update(users)
      .set({
        googleSub: null,
        email: null,
        passwordHash: null,
        handle: null,
        displayName: '退会したユーザー',
        avatarUrl: null,
        bio: null,
        companyName: null,
        companySlug: null,
        deletedAt: now(),
      })
      .where(eq(users.id, user.id)),
  )
  const reactedIds = reacted.map((r) => r.postId)
  for (let i = 0; i < reactedIds.length; i += 90) {
    statements.push(
      db
        .update(posts)
        .set({ reactionCount: sql`(SELECT count(*) FROM reactions WHERE reactions.post_id = posts.id)` })
        .where(inArray(posts.id, reactedIds.slice(i, i + 90))),
    )
  }

  await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
  return c.json({ imageKeys } satisfies Schemas['AccountDeleted'], 200, privateCache)
})

/** 画像をアップロードしてよいか（回数制限）。実際のアップロードは web の Worker が R2 に行う。 */
me.post('/uploads', async (c) => {
  const user = activeUser(c)
  await consumeRateLimit(c.var.db, 'image_upload', user)
  return c.json({ userId: user.id } satisfies Schemas['UploadTicket'], 200, privateCache)
})

/** 閲覧者ごとの情報（自分のリアクション・フォロー・ブロック）。公開 API のキャッシュから切り離す。 */
me.get('/viewer-state', async (c) => {
  const db = c.var.db
  const user = currentUser(c)

  const ids = [
    ...new Set(
      (c.req.query('postIds') ?? '')
        .split(',')
        .filter((id) => id !== '')
        .slice(0, 100)
        .filter(isUlid),
    ),
  ]
  const mine = await inChunks(ids, (chunk) =>
    db
      .select({ postId: reactions.postId, emoji: reactions.emoji })
      .from(reactions)
      .where(and(eq(reactions.userId, user.id), inArray(reactions.postId, chunk)))
      .orderBy(asc(reactions.id)),
  )
  const byPost = new Map<string, string[]>()
  for (const { postId, emoji } of mine) byPost.set(postId, [...(byPost.get(postId) ?? []), emoji])

  let isFollowing: boolean | null = null
  let blocking: boolean | null = null
  const handle = c.req.query('handle')
  if (handle) {
    const owner = await findRoomOwner(db, handle)
    isFollowing = owner !== undefined && (await findFollow(db, user.id, owner.id)) !== undefined
    blocking = owner !== undefined && (await isBlocking(db, user.id, owner.id))
  }

  return c.json(
    {
      reactions: [...byPost].map(([postId, emojis]) => ({ postId, emojis })),
      isFollowing,
      blockedHandles: await findBlockedHandles(db, user.id),
      isBlocking: blocking,
    } satisfies Schemas['ViewerState'],
    200,
    privateCache,
  )
})
