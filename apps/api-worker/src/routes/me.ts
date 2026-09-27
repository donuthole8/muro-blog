import { and, asc, count, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { Hono } from 'hono'
import type { Db, User } from '../db/client'
import {
  archivedPosts,
  blocks,
  emailTokens,
  follows,
  mutes,
  notifications,
  posts,
  pushSubscriptions,
  reactions,
  sessions,
  users,
} from '../db/schema'
import type { AppEnv } from '../env'
import { activeUser, currentUser } from '../lib/auth'
import { ApiError, invalid, isUlid, now, privateCache } from '../lib/http'
import { Input } from '../lib/input'
import { companySlug, handleViolation, isValidEmoji, normalizeHandle } from '../lib/policy'
import { consumeRateLimit } from '../lib/rateLimit'
import { sendVerificationMail } from '../services/emailTokens'
import { toMe, type Schemas } from '../services/mapper'
import { vapidKeys } from '../services/push'
import { inChunks } from '../services/posts'
import {
  findBlockedHandles,
  findFollow,
  findMutedHandles,
  findRoomOwner,
  findUserByHandle,
  isBlocking,
  isMuting,
} from '../services/users'
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
 * - ブログ記事は行ごと消す
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
  const ownArticles = await db
    .select({ ogImageKey: archivedPosts.ogImageKey })
    .from(archivedPosts)
    .where(eq(archivedPosts.authorId, user.id))
  const imageKeys = [
    ...(user.avatarKey ? [user.avatarKey] : []),
    ...own.flatMap((p) => (p.imageKey ? [p.imageKey] : [])),
    ...ownArticles.flatMap((a) => (a.ogImageKey ? [a.ogImageKey] : [])),
  ]

  // リアクションを消す投稿の件数を先に控えておき、消した後で数え直す
  const reacted = await db
    .selectDistinct({ postId: reactions.postId })
    .from(reactions)
    .where(eq(reactions.userId, user.id))

  const statements: BatchItem<'sqlite'>[] = own.flatMap((p) => deletePostStatements(db, p))
  statements.push(
    // ブログ記事は行ごと消す（添付していた投稿からは ON DELETE SET NULL で外れる）
    db.delete(archivedPosts).where(eq(archivedPosts.authorId, user.id)),
    db.delete(reactions).where(eq(reactions.userId, user.id)),
    db.delete(notifications).where(or(eq(notifications.userId, user.id), eq(notifications.actorId, user.id))),
    db.delete(follows).where(or(eq(follows.followerId, user.id), eq(follows.followeeId, user.id))),
    db.delete(blocks).where(or(eq(blocks.blockerId, user.id), eq(blocks.blockedId, user.id))),
    db.delete(mutes).where(or(eq(mutes.muterId, user.id), eq(mutes.mutedId, user.id))),
    db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, user.id)),
    db.delete(emailTokens).where(eq(emailTokens.userId, user.id)),
    db.delete(sessions).where(eq(sessions.userId, user.id)),
    db
      .update(users)
      .set({
        googleSub: null,
        email: null,
        passwordHash: null,
        emailVerifiedAt: null,
        handle: null,
        displayName: '退会したユーザー',
        avatarUrl: null,
        avatarKey: null,
        statusEmoji: null,
        statusText: null,
        statusExpiresAt: null,
        mutedWords: null,
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
  let muting: boolean | null = null
  const handle = c.req.query('handle')
  if (handle) {
    const owner = await findRoomOwner(db, handle)
    isFollowing = owner !== undefined && (await findFollow(db, user.id, owner.id)) !== undefined
    blocking = owner !== undefined && (await isBlocking(db, user.id, owner.id))
    muting = owner !== undefined && (await isMuting(db, user.id, owner.id))
  }

  return c.json(
    {
      reactions: [...byPost].map(([postId, emojis]) => ({ postId, emojis })),
      isFollowing,
      blockedHandles: await findBlockedHandles(db, user.id),
      isBlocking: blocking,
      mutedHandles: await findMutedHandles(db, user.id),
      isMuting: muting,
    } satisfies Schemas['ViewerState'],
    200,
    privateCache,
  )
})

// ---------- メールアドレスの確認 ----------

/** 確認メールを送り直す。 */
me.post('/email/verification', async (c) => {
  const db = c.var.db
  const user = currentUser(c)
  if (user.email === null || user.emailVerifiedAt !== null) {
    throw new ApiError(422, 'このアカウントは確認の必要がありません。')
  }
  await consumeRateLimit(db, 'mail', user.email)
  if (!(await sendVerificationMail(c.env, db, { ...user, email: user.email }))) {
    throw new ApiError(503, 'メールを送信できませんでした。時間をおいてお試しください。')
  }
  return c.body(null, 204)
})

// ---------- アイコン ----------

/** web のアイコンのアップロード（lib/account.ts の uploadAvatar）が作るキーの形。先頭は本人の ID。 */
const AVATAR_KEY_PATTERN = /^a_([0-9A-HJKMNP-TV-Z]{26})_[0-9a-f-]{36}\.(?:webp|jpg|png)$/

/**
 * アイコンを差し替える。画像は web の Worker が先に KV へ置いておく。
 * 返り値の removedKey（前のアイコン）は web の Worker が KV から消す。
 */
me.put('/avatar', async (c) => {
  const db = c.var.db
  const user = activeUser(c)
  const input = await Input.from(c)
  const key = input.string('avatarKey', { required: true, max: 128 })
  input.assertValid()

  // 他人のアップロードを自分のアイコンにできないよう、キーに埋めた ID を照合する
  const m = AVATAR_KEY_PATTERN.exec(key)
  if (!m || m[1] !== user.id) throw invalid('avatarKey', '画像の指定が不正です。アップロードし直してください。')

  const updated = await db.update(users).set({ avatarKey: key }).where(eq(users.id, user.id)).returning().get()
  return c.json(
    { me: await meResponse(db, updated), removedKey: user.avatarKey } satisfies Schemas['AvatarChanged'],
    200,
    privateCache,
  )
})

/** 自分でアップロードしたアイコンをやめる（Google のアイコンか頭文字に戻る）。 */
me.delete('/avatar', async (c) => {
  const db = c.var.db
  const user = currentUser(c)
  const updated = await db.update(users).set({ avatarKey: null }).where(eq(users.id, user.id)).returning().get()
  return c.json(
    { me: await meResponse(db, updated), removedKey: user.avatarKey } satisfies Schemas['AvatarChanged'],
    200,
    privateCache,
  )
})

// ---------- 今の状態 ----------

const STATUS_TEXT_MAX = 40
/** 期限の上限は1週間。無期限は null */
const STATUS_EXPIRES_MAX_MINUTES = 7 * 24 * 60

me.put('/status', async (c) => {
  const db = c.var.db
  const user = activeUser(c)
  const input = await Input.from(c)
  const emoji = input.string('emoji', { required: true, max: 16, requiredMessage: '絵文字を選んでください。' })
  const text = input.optionalString('text', { max: STATUS_TEXT_MAX, maxMessage: `${STATUS_TEXT_MAX} 文字までです。` })
  const minutes = input.optionalInteger('expiresInMinutes', { min: 1, max: STATUS_EXPIRES_MAX_MINUTES })
  if (emoji !== '' && !isValidEmoji(emoji)) input.fail('emoji', '絵文字を1つだけ指定してください。')
  input.assertValid()

  await consumeRateLimit(db, 'profile', user)
  const updated = await db
    .update(users)
    .set({
      statusEmoji: emoji,
      statusText: text?.trim() || null,
      statusExpiresAt: minutes === null ? null : new Date(now().getTime() + minutes * 60 * 1000),
    })
    .where(eq(users.id, user.id))
    .returning()
    .get()
  return c.json(await meResponse(db, updated), 200, privateCache)
})

me.delete('/status', async (c) => {
  const db = c.var.db
  const user = currentUser(c)
  const updated = await db
    .update(users)
    .set({ statusEmoji: null, statusText: null, statusExpiresAt: null })
    .where(eq(users.id, user.id))
    .returning()
    .get()
  return c.json(await meResponse(db, updated), 200, privateCache)
})

// ---------- ミュートする語 ----------

const MUTED_WORDS_MAX = 50
const MUTED_WORD_LENGTH = 30

me.put('/muted-words', async (c) => {
  const db = c.var.db
  const user = currentUser(c)
  const input = await Input.from(c)
  const raw = input.stringList('words', {
    maxCount: MUTED_WORDS_MAX,
    maxCountMessage: `ミュートする語は ${MUTED_WORDS_MAX} 個までです。`,
  })
  input.assertValid()

  const words = [...new Set(raw.map((w) => w.trim().toLowerCase()).filter((w) => w !== ''))]
  if (words.some((w) => [...w].length > MUTED_WORD_LENGTH)) {
    throw invalid('words', `1つの語は ${MUTED_WORD_LENGTH} 文字までです。`)
  }
  const updated = await db.update(users).set({ mutedWords: words }).where(eq(users.id, user.id)).returning().get()
  return c.json(await meResponse(db, updated), 200, privateCache)
})

// ---------- Web Push ----------

/** ブラウザが購読するときに使う公開鍵。サーバーに鍵が無ければ null（プッシュ通知は使えない）。 */
me.get('/push-config', (c) => {
  currentUser(c)
  return c.json(
    { publicKey: vapidKeys(c.env)?.publicKey ?? null } satisfies Schemas['PushConfig'],
    200,
    privateCache,
  )
})

const BASE64URL = /^[A-Za-z0-9_-]+$/

me.post('/push-subscriptions', async (c) => {
  const db = c.var.db
  const user = currentUser(c)
  const input = await Input.from(c)
  const endpoint = input.string('endpoint', { required: true, max: 1024 })
  const p256dh = input.string('p256dh', { required: true, max: 128 })
  const auth = input.string('auth', { required: true, max: 64 })
  if (endpoint !== '' && !/^https:\/\//.test(endpoint)) input.fail('endpoint', '購読の URL が不正です。')
  if (!BASE64URL.test(p256dh) || !BASE64URL.test(auth)) input.fail('p256dh', '購読の鍵が不正です。')
  input.assertValid()

  await consumeRateLimit(db, 'push_subscribe', user)
  // 同じブラウザで別の人がログインし直したときは、購読をその人に付け替える
  await db
    .insert(pushSubscriptions)
    .values({ userId: user.id, endpoint, p256dh, auth, createdAt: now() })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId: user.id, p256dh, auth } })
  return c.body(null, 204)
})

me.delete('/push-subscriptions', async (c) => {
  const user = currentUser(c)
  const input = await Input.from(c)
  const endpoint = input.string('endpoint', { required: true, max: 1024 })
  input.assertValid()
  await c.var.db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, user.id), eq(pushSubscriptions.endpoint, endpoint)))
  return c.body(null, 204)
})
