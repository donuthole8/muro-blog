import { and, asc, count, desc, eq, inArray, isNotNull, isNull, lt, ne } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { Hono, type Context } from 'hono'
import type { Db } from '../db/client'
import { archivedPosts, posts, reports, tags, users } from '../db/schema'
import type { AppEnv } from '../env'
import { requireAdmin, revokeAllSessions } from '../lib/auth'
import { ApiError, isUlid, iso, notFound, now, parseCursor, privateCache, toPage } from '../lib/http'
import { Input, SLUG_PATTERN } from '../lib/input'
import { moderateText } from '../lib/moderation'
import {
  postState,
  toAdminPost,
  toAdminUser,
  type PostWithAuthor,
  type Schemas,
} from '../services/mapper'
import { selectArticles } from '../services/articles'
import { findForModeration, findPostById } from '../services/posts'
import { findUserByHandle, findUserById, searchUsersForAdmin } from '../services/users'
import { deletePost, moderationFields } from '../services/writer'

/** 管理画面（/admin）の API。role=admin のユーザーだけが使える。 */
export const admin = new Hono<AppEnv>()

admin.use(requireAdmin)

const ADMIN_PAGE_SIZE = 50

function idParam(c: Context<AppEnv>): string {
  const id = c.req.param('id') ?? ''
  if (!isUlid(id)) throw notFound()
  return id
}

/** 通報を「対応済み（措置した）」にする。非表示・削除したとき。 */
function resolveReportsFor(db: Db, postId: string) {
  return db
    .update(reports)
    .set({ resolution: 'actioned', resolvedAt: now() })
    .where(and(eq(reports.postId, postId), isNull(reports.resolvedAt)))
}

// ---------- 投稿 ----------

admin.get('/posts', async (c) => {
  const db = c.var.db
  const handle = c.req.query('handle')
  let authorId: string | null = null
  if (handle) {
    const author = await findUserByHandle(db, handle)
    if (!author) {
      return c.json({ items: [], nextCursor: null } satisfies Schemas['AdminPostPage'], 200, privateCache)
    }
    authorId = author.id
  }

  const page = await findForModeration(db, parseCursor(c.req.query('cursor')), ADMIN_PAGE_SIZE, authorId)
  return c.json(
    { items: page.items.map(toAdminPost), nextCursor: page.nextCursor } satisfies Schemas['AdminPostPage'],
    200,
    privateCache,
  )
})

async function toggleHidden(c: Context<AppEnv>, hidden: boolean) {
  const db = c.var.db
  const row = await findPostById(db, idParam(c))
  if (!row || row.post.deletedAt) throw notFound('投稿が見つかりません。')

  const hiddenAt = hidden ? (row.post.hiddenAt ?? now()) : null
  // 非表示を解除したら、Jev の判定（自動非表示・折りたたみ）も管理者の判断で取り消す
  const moderation = hidden ? row.post.moderation : null
  await db.update(posts).set({ hiddenAt, moderation }).where(eq(posts.id, row.post.id))
  if (hidden) await resolveReportsFor(db, row.post.id)

  return c.json(toAdminPost({ ...row, post: { ...row.post, hiddenAt, moderation } }), 200, privateCache)
}

admin.post('/posts/:id/hide', (c) => toggleHidden(c, true))
admin.post('/posts/:id/unhide', (c) => toggleHidden(c, false))

/**
 * 1件だけ今のしきい値・判定内容で判定し直す。
 * 自動非表示だったものが blocked でなくなれば非表示も外す。管理者が手で非表示にしたものはそのまま。
 */
admin.post('/posts/:id/moderate', async (c) => {
  const db = c.var.db
  const row = await findPostById(db, idParam(c))
  if (!row || row.post.deletedAt) throw notFound('投稿が見つかりません。')
  if (!c.env.TYPESAFE_API_KEY) throw new ApiError(422, 'TYPESAFE_API_KEY が設定されていません。')
  if (row.post.bodyMarkdown === '') throw new ApiError(422, '本文のない投稿は判定できません。')

  const verdict = await moderateText(c.env.TYPESAFE_API_KEY, row.post.bodyMarkdown)
  if (!verdict) throw new ApiError(502, 'Jev での判定に失敗しました（クレジット切れの可能性があります）。')

  const fields = moderationFields(verdict, now())
  const wasAutoHidden = row.post.moderation === 'blocked'
  const hiddenAt =
    verdict.level === 'blocked'
      ? (row.post.hiddenAt ?? fields.hiddenAt ?? now())
      : wasAutoHidden
        ? null
        : row.post.hiddenAt
  const post = { ...row.post, ...fields, hiddenAt }
  await db
    .update(posts)
    .set({
      moderation: post.moderation,
      moderationCategory: post.moderationCategory,
      moderationScore: post.moderationScore,
      hiddenAt,
    })
    .where(eq(posts.id, post.id))

  return c.json(toAdminPost({ ...row, post }), 200, privateCache)
})

/**
 * 未判定の投稿（Jev 導入前のもの・判定に失敗したもの）をまとめて判定する。
 * Workers の1リクエストのサブリクエスト上限に収まるよう、1回に BACKFILL_BATCH 件ずつ。
 * 管理画面が remaining が 0 になるまで繰り返し呼ぶ。Jev が失敗したら（クレジット切れなど）そこで止める。
 */
const BACKFILL_BATCH = 20

function unmoderated() {
  return and(isNull(posts.deletedAt), isNull(posts.moderationScore), ne(posts.bodyMarkdown, ''))
}

admin.post('/posts/moderate', async (c) => {
  const db = c.var.db
  const apiKey = c.env.TYPESAFE_API_KEY
  if (!apiKey) throw new ApiError(422, 'TYPESAFE_API_KEY が設定されていません。')

  const rows = await db
    .select({ id: posts.id, bodyMarkdown: posts.bodyMarkdown, hiddenAt: posts.hiddenAt })
    .from(posts)
    .where(unmoderated())
    .orderBy(desc(posts.id))
    .limit(BACKFILL_BATCH)

  let processed = 0
  let blocked = 0
  let sensitive = 0
  let stopped = false
  for (const row of rows) {
    const verdict = await moderateText(apiKey, row.bodyMarkdown)
    if (!verdict) {
      stopped = true
      break
    }
    const fields = moderationFields(verdict, now())
    // 管理者が既に非表示にしていたものは、その日時を残す
    if (row.hiddenAt) delete fields.hiddenAt
    await db.update(posts).set(fields).where(eq(posts.id, row.id))
    processed++
    if (verdict.level === 'blocked') blocked++
    if (verdict.level === 'sensitive') sensitive++
  }

  const left = await db.select({ n: count() }).from(posts).where(unmoderated()).get()
  return c.json(
    { processed, blocked, sensitive, remaining: left?.n ?? 0, stopped } satisfies Schemas['ModerationBackfill'],
    200,
    privateCache,
  )
})

admin.delete('/posts/:id', async (c) => {
  const db = c.var.db
  const row = await findPostById(db, idParam(c))
  if (!row) throw notFound('投稿が見つかりません。')

  const imageKey = await deletePost(db, row.post)
  await resolveReportsFor(db, row.post.id)
  return c.json({ imageKey } satisfies Schemas['PostDeleted'], 200, privateCache)
})

// ---------- ブログ記事 ----------

type ArticleRow = { article: typeof archivedPosts.$inferSelect; author: typeof users.$inferSelect | null }

function toAdminArticle({ article, author }: ArticleRow): Schemas['AdminArticle'] {
  return {
    id: article.id,
    slug: article.slug,
    title: article.title,
    emoji: article.emoji,
    excerpt: article.excerpt,
    status: article.status,
    author: author ? toAdminUser(author) : null,
    hiddenAt: iso(article.hiddenAt),
    publishedAt: iso(article.publishedAt),
    updatedAt: iso(article.updatedAt),
  }
}

function articleIdParam(c: Context<AppEnv>): number {
  const id = Number(c.req.param('id'))
  if (!Number.isSafeInteger(id) || id <= 0) throw notFound('記事が見つかりません。')
  return id
}

async function findArticleOr404(c: Context<AppEnv>): Promise<ArticleRow> {
  const row = await selectArticles(c.var.db).where(eq(archivedPosts.id, articleIdParam(c))).get()
  if (!row) throw notFound('記事が見つかりません。')
  return row
}

/** 記事（下書き・非表示を含む）を新しい順に。cursor は直前のページの最後の記事 ID。 */
admin.get('/articles', async (c) => {
  const db = c.var.db
  const cursor = Number(c.req.query('cursor') ?? '')
  const handle = c.req.query('handle')
  let authorId: string | null = null
  if (handle) {
    const author = await findUserByHandle(db, handle)
    if (!author) {
      return c.json({ items: [], nextCursor: null } satisfies Schemas['AdminArticlePage'], 200, privateCache)
    }
    authorId = author.id
  }

  const rows = await selectArticles(db)
    .where(
      and(
        Number.isSafeInteger(cursor) && cursor > 0 ? lt(archivedPosts.id, cursor) : undefined,
        authorId ? eq(archivedPosts.authorId, authorId) : undefined,
      ),
    )
    .orderBy(desc(archivedPosts.id))
    .limit(ADMIN_PAGE_SIZE + 1)
  const items = rows.slice(0, ADMIN_PAGE_SIZE)

  return c.json(
    {
      items: items.map(toAdminArticle),
      nextCursor: rows.length > ADMIN_PAGE_SIZE ? String(items[items.length - 1].article.id) : null,
    } satisfies Schemas['AdminArticlePage'],
    200,
    privateCache,
  )
})

async function toggleArticleHidden(c: Context<AppEnv>, hidden: boolean) {
  const row = await findArticleOr404(c)
  const hiddenAt = hidden ? (row.article.hiddenAt ?? now()) : null
  await c.var.db.update(archivedPosts).set({ hiddenAt }).where(eq(archivedPosts.id, row.article.id))
  return c.json(toAdminArticle({ ...row, article: { ...row.article, hiddenAt } }), 200, privateCache)
}

admin.post('/articles/:id/hide', (c) => toggleArticleHidden(c, true))
admin.post('/articles/:id/unhide', (c) => toggleArticleHidden(c, false))

admin.delete('/articles/:id', async (c) => {
  const row = await findArticleOr404(c)
  await c.var.db.delete(archivedPosts).where(eq(archivedPosts.id, row.article.id))
  return c.json({ imageKey: row.article.ogImageKey } satisfies Schemas['ArticleDeleted'], 200, privateCache)
})

// ---------- ユーザー ----------

admin.get('/users', async (c) => {
  const found = await searchUsersForAdmin(c.var.db, c.req.query('q'), ADMIN_PAGE_SIZE)
  return c.json(found.map(toAdminUser), 200, privateCache)
})

admin.post('/users/:id/suspend', async (c) => {
  const db = c.var.db
  const user = await findUserById(db, idParam(c))
  if (!user) throw notFound('ユーザーが見つかりません。')
  if (user.role === 'admin') {
    throw new ApiError(422, '管理者は停止できません。先に管理者権限を外してください。')
  }

  const updated = await db
    .update(users)
    .set({ suspendedAt: user.suspendedAt ?? now() })
    .where(eq(users.id, user.id))
    .returning()
    .get()
  await revokeAllSessions(db, user.id)
  return c.json(toAdminUser(updated), 200, privateCache)
})

admin.post('/users/:id/unsuspend', async (c) => {
  const db = c.var.db
  const user = await findUserById(db, idParam(c))
  if (!user) throw notFound('ユーザーが見つかりません。')

  const updated = await db
    .update(users)
    .set({ suspendedAt: null })
    .where(eq(users.id, user.id))
    .returning()
    .get()
  return c.json(toAdminUser(updated), 200, privateCache)
})

// ---------- 通報 ----------

const reporters = alias(users, 'reporter')

async function toAdminReports(db: Db, rows: (typeof reports.$inferSelect)[]) {
  if (rows.length === 0) return []
  const postIds = [...new Set(rows.map((r) => r.postId))]
  const reporterIds = [...new Set(rows.map((r) => r.reporterId))]

  const [postRows, reporterRows] = await Promise.all([
    db
      .select({ post: posts, author: users })
      .from(posts)
      .innerJoin(users, eq(users.id, posts.authorId))
      .where(inArray(posts.id, postIds)),
    db.select().from(reporters).where(inArray(reporters.id, reporterIds)),
  ])
  const postsById = new Map<string, PostWithAuthor>(postRows.map((r) => [r.post.id, r]))
  const reportersById = new Map(reporterRows.map((u) => [u.id, u]))

  return rows.flatMap((report): Schemas['AdminReport'][] => {
    const post = postsById.get(report.postId)
    const reporter = reportersById.get(report.reporterId)
    if (!post || !reporter) return []
    return [
      {
        id: report.id,
        post: toAdminPost(post),
        postState: postState(post),
        reporter: toAdminUser(reporter),
        reason: report.reason as Schemas['AdminReport']['reason'],
        detail: report.detail,
        resolution: report.resolution as Schemas['AdminReport']['resolution'],
        resolvedAt: iso(report.resolvedAt),
        createdAt: iso(report.createdAt),
      },
    ]
  })
}

admin.get('/reports', async (c) => {
  const db = c.var.db
  const open = c.req.query('status') !== 'resolved'
  const cursor = parseCursor(c.req.query('cursor'))

  const [rows, openCount] = await Promise.all([
    db
      .select()
      .from(reports)
      .where(
        and(
          open ? isNull(reports.resolvedAt) : isNotNull(reports.resolvedAt),
          cursor ? lt(reports.id, cursor) : undefined,
        ),
      )
      .orderBy(desc(reports.id))
      .limit(ADMIN_PAGE_SIZE + 1),
    db.select({ n: count() }).from(reports).where(isNull(reports.resolvedAt)).get(),
  ])
  const page = toPage(rows, ADMIN_PAGE_SIZE)

  return c.json(
    {
      items: await toAdminReports(db, page.items),
      nextCursor: page.nextCursor,
      openCount: openCount?.n ?? 0,
    } satisfies Schemas['AdminReportPage'],
    200,
    privateCache,
  )
})

admin.post('/reports/:id/dismiss', async (c) => {
  const db = c.var.db
  const report = await db
    .update(reports)
    .set({ resolution: 'dismissed', resolvedAt: now() })
    .where(eq(reports.id, idParam(c)))
    .returning()
    .get()
  if (!report) throw notFound('通報が見つかりません。')

  const [item] = await toAdminReports(db, [report])
  if (!item) throw notFound('通報が見つかりません。')
  return c.json(item, 200, privateCache)
})

// ---------- タグ ----------

admin.get('/tags', async (c) => {
  const rows = await c.var.db.select().from(tags).orderBy(asc(tags.name))
  return c.json(
    rows.map(({ name, slug }) => ({ name, slug })) satisfies Schemas['TagSummary'][],
    200,
    privateCache,
  )
})

admin.post('/tags', async (c) => {
  const db = c.var.db
  const input = await Input.from(c)
  const name = input.string('name', { required: true, requiredMessage: 'タグ名は必須です。', max: 64 })
  const slug = input.string('slug', { required: true, requiredMessage: 'slug は必須です。', max: 64 })
  if (slug !== '' && !SLUG_PATTERN.test(slug)) {
    input.fail('slug', 'slug は英小文字・数字・ハイフンのみ使用できます。')
  }
  input.assertValid()

  if (await db.select().from(tags).where(eq(tags.slug, slug)).get()) {
    throw new ApiError(409, `slug "${slug}" のタグは既にあります。`)
  }
  if (await db.select().from(tags).where(eq(tags.name, name)).get()) {
    throw new ApiError(409, `タグ名 "${name}" は既にあります。`)
  }
  const tag = await db.insert(tags).values({ name, slug }).returning().get()
  return c.json({ name: tag.name, slug: tag.slug } satisfies Schemas['TagSummary'], 201, privateCache)
})
