import { and, eq, sql } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import { posts, reactions, reports } from '../db/schema'
import type { AppEnv } from '../env'
import { activeUser, currentUser } from '../lib/auth'
import {
  ApiError,
  CacheFor,
  forbidden,
  invalid,
  isUlid,
  newId,
  notFound,
  now,
  privateCache,
  publicCache,
} from '../lib/http'
import { Input, SLUG_PATTERN } from '../lib/input'
import { isValidEmoji } from '../lib/policy'
import { consumeRateLimit } from '../lib/rateLimit'
import { isPostVisible, type Schemas } from '../services/mapper'
import { findPostById, findReplies, toPosts } from '../services/posts'
import { isBlocking } from '../services/users'
import {
  MAX_BODY_LENGTH,
  MAX_TAGS,
  MAX_TAG_NAME_LENGTH,
  createPost,
  deletePostAsAuthor,
  notifyReaction,
  updatePost,
  type WriterContext,
} from '../services/writer'

export const postRoutes = new Hono<AppEnv>()

function writerContext(c: Context<AppEnv>): WriterContext {
  return {
    db: c.var.db,
    siteHost: c.env.SITE_HOST,
    typesafeApiKey: c.env.TYPESAFE_API_KEY,
    waitUntil: (p) => c.executionCtx.waitUntil(p),
  }
}

/** :id が ULID でなければ 404（Symfony のルート requirements と同じ）。 */
function postId(c: Context<AppEnv>): string {
  const id = c.req.param('id') ?? ''
  if (!isUlid(id)) throw notFound()
  return id
}

async function findPostOr404(c: Context<AppEnv>) {
  const row = await findPostById(c.var.db, postId(c))
  if (!row) throw notFound('投稿が見つかりません。')
  return row
}

const bodyRule = {
  max: MAX_BODY_LENGTH,
  maxMessage: `本文は ${MAX_BODY_LENGTH} 文字までです。`,
}

const tagRule = {
  maxCount: MAX_TAGS,
  maxCountMessage: `タグは ${MAX_TAGS} 個までです。`,
  pattern: SLUG_PATTERN,
  patternMessage: 'タグの slug が不正です。',
}

const newTagRule = {
  maxCount: MAX_TAGS,
  maxCountMessage: `タグは ${MAX_TAGS} 個までです。`,
  // 名前は自由だが、空白だけ・長すぎる・制御文字入りは受け付けない
  pattern: new RegExp(`^(?=.*\\S)[^\\p{Cc}]{1,${MAX_TAG_NAME_LENGTH}}$`, 'u'),
  patternMessage: `タグ名は ${MAX_TAG_NAME_LENGTH} 文字までです。`,
}

/** スレッド（親投稿と返信）。 */
postRoutes.get('/:id', async (c) => {
  const db = c.var.db
  const row = await findPostById(db, postId(c))
  if (!row || row.post.parentId !== null || (!isPostVisible(row) && row.post.replyCount === 0)) {
    throw notFound('スレッドが見つかりません。')
  }

  const replies = await findReplies(db, row.post.id)
  const [post, ...mapped] = await toPosts(db, [row, ...replies])
  return c.json(
    { post, replies: mapped } satisfies Schemas['Thread'],
    200,
    publicCache(CacheFor.FRESH),
  )
})

/** 編集用の Markdown 原文（本人だけ）。 */
postRoutes.get('/:id/source', async (c) => {
  const user = currentUser(c)
  const row = await findPostById(c.var.db, postId(c))
  if (!row || !isPostVisible(row) || row.post.authorId !== user.id) {
    throw notFound('投稿が見つかりません。')
  }
  return c.json(
    { bodyMarkdown: row.post.bodyMarkdown } satisfies Schemas['PostSource'],
    200,
    privateCache,
  )
})

postRoutes.post('/', async (c) => {
  const user = activeUser(c)
  const input = await Input.from(c)
  const bodyMarkdown = input.string('bodyMarkdown', bodyRule)
  const parentId = input.optionalString('parentId')
  if (parentId !== null && !isUlid(parentId)) input.fail('parentId', '返信先の ID が不正です。')
  const imageKey = input.optionalString('imageKey', { max: 128 })
  const tagSlugs = input.stringList('tagSlugs', tagRule)
  const newTags = input.stringList('newTags', newTagRule)
  const articleId = input.optionalId('articleId')
  input.assertValid()

  const created = await createPost(writerContext(c), user, {
    bodyMarkdown,
    parentId,
    imageKey,
    tagSlugs,
    newTags,
    articleId,
  })
  const [post] = await toPosts(c.var.db, [created])
  return c.json(post, 201, privateCache)
})

postRoutes.put('/:id', async (c) => {
  const user = activeUser(c)
  const row = await findPostOr404(c)
  const input = await Input.from(c)
  const bodyMarkdown = input.string('bodyMarkdown', bodyRule)
  const tagSlugs = input.stringList('tagSlugs', tagRule)
  const newTags = input.stringList('newTags', newTagRule)
  input.assertValid()

  const updated = await updatePost(writerContext(c), user, row, { bodyMarkdown, tagSlugs, newTags })
  const [post] = await toPosts(c.var.db, [updated])
  return c.json(post, 200, privateCache)
})

postRoutes.delete('/:id', async (c) => {
  const user = currentUser(c)
  const row = await findPostOr404(c)
  const imageKey = await deletePostAsAuthor(c.var.db, user, row.post)
  return c.json({ imageKey } satisfies Schemas['PostDeleted'], 200, privateCache)
})

// ---------- リアクション ----------

/** 絵文字ごとの件数から数え直す（増減ではないので、競合しても数がずれない）。 */
function reactionCountOf(id: string) {
  return sql`(SELECT count(*) FROM reactions WHERE post_id = ${id})`
}

postRoutes.put('/:id/reactions/:emoji', async (c) => {
  const db = c.var.db
  const user = activeUser(c)
  const row = await findPostOr404(c)
  if (!isPostVisible(row)) throw notFound('投稿が見つかりません。')

  const emoji = c.req.param('emoji')
  if (!isValidEmoji(emoji)) throw invalid('emoji', '絵文字を1つだけ指定してください。')
  if (await isBlocking(db, row.author.id, user.id)) {
    throw forbidden('この投稿にはリアクションできません。')
  }
  await consumeRateLimit(db, 'reaction', user)

  const [inserted] = await db.batch([
    db
      .insert(reactions)
      .values({ postId: row.post.id, userId: user.id, emoji, createdAt: now() })
      .onConflictDoNothing()
      .returning({ id: reactions.id }),
    db.update(posts).set({ reactionCount: reactionCountOf(row.post.id) }).where(eq(posts.id, row.post.id)),
  ])
  if (inserted.length > 0) await notifyReaction(db, row, user)

  return c.body(null, 204)
})

postRoutes.delete('/:id/reactions/:emoji', async (c) => {
  const db = c.var.db
  const user = activeUser(c)
  const row = await findPostOr404(c)
  const emoji = c.req.param('emoji')

  await db.batch([
    db
      .delete(reactions)
      .where(
        and(eq(reactions.postId, row.post.id), eq(reactions.userId, user.id), eq(reactions.emoji, emoji)),
      ),
    db.update(posts).set({ reactionCount: reactionCountOf(row.post.id) }).where(eq(posts.id, row.post.id)),
  ])
  return c.body(null, 204)
})

// ---------- 通報 ----------

const REPORT_REASONS = ['spam', 'harassment', 'privacy', 'illegal', 'other'] as const
type ReportReason = (typeof REPORT_REASONS)[number]

postRoutes.post('/:id/report', async (c) => {
  const db = c.var.db
  const user = activeUser(c)
  const row = await findPostOr404(c)
  if (!isPostVisible(row)) throw notFound('投稿が見つかりません。')
  if (row.author.id === user.id) throw new ApiError(422, '自分の投稿は通報できません。')

  const input = await Input.from(c)
  const reason = (input.optionalString('reason') ?? 'other') as ReportReason
  if (!REPORT_REASONS.includes(reason)) input.fail('reason', '通報の理由が不正です。')
  const rawDetail = input.optionalString('detail', { max: 500, maxMessage: '詳細は 500 文字までです。' })
  input.assertValid()
  const detail = rawDetail?.trim() || null

  const existing = await db
    .select()
    .from(reports)
    .where(and(eq(reports.postId, row.post.id), eq(reports.reporterId, user.id)))
    .get()

  // 未対応の通報の出し直しは回数に数えない
  if (!existing || existing.resolvedAt) await consumeRateLimit(db, 'report', user)

  if (existing) {
    await db
      .update(reports)
      .set({ reason, detail, resolution: null, resolvedAt: null, createdAt: now() })
      .where(eq(reports.id, existing.id))
  } else {
    await db.insert(reports).values({
      id: newId(),
      postId: row.post.id,
      reporterId: user.id,
      reason,
      detail,
      createdAt: now(),
    })
  }
  return c.body(null, 204)
})
