import { and, desc, eq } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import { archivedPosts } from '../db/schema'
import type { AppEnv } from '../env'
import { activeUser, currentUser } from '../lib/auth'
import { CacheFor, notFound, privateCache, publicCache } from '../lib/http'
import { Input, SLUG_PATTERN } from '../lib/input'
import { renderArticleBody } from '../lib/markdown'
import { HANDLE_PARAM, isValidEmoji } from '../lib/policy'
import { consumeRateLimit } from '../lib/rateLimit'
import {
  MAX_ARTICLE_BODY,
  countArticles,
  MAX_ARTICLE_SLUG,
  MAX_ARTICLE_TITLE,
  findOwnArticle,
  publishedArticle,
  saveArticle,
  selectArticles,
  tagsByArticle,
  toArticleDetail,
  toArticleSource,
  toArticleSummary,
  toMyArticle,
  type Article,
  type ArticleInput,
} from '../services/articles'
import type { Schemas } from '../services/mapper'
import { findRoomOwner } from '../services/users'
import { MAX_TAGS, MAX_TAG_NAME_LENGTH } from '../services/writer'

/**
 * ユーザーのブログ記事。公開ページは /@handle/articles/:slug、書くのは /articles/new（web）。
 * 旧ブログの記事（書き手なし）は routes/archive.ts が扱う。
 */
export const articles = new Hono<AppEnv>()

const DEFAULT_PER_PAGE = 10
const MAX_PER_PAGE = 50

const intParam = (value: string | undefined, fallback: number) => {
  const n = Number.parseInt(value ?? '', 10)
  return Number.isFinite(n) ? n : fallback
}

// ---------- 公開 ----------

async function findAuthorOr404(c: Context<AppEnv>) {
  const handle = c.req.param('handle') ?? ''
  const user = HANDLE_PARAM.test(handle) ? await findRoomOwner(c.var.db, handle) : undefined
  if (!user) throw notFound('部屋が見つかりません。')
  return user
}

articles.get('/users/:handle/articles', async (c) => {
  const db = c.var.db
  const author = await findAuthorOr404(c)
  const page = Math.max(1, intParam(c.req.query('page'), 1))
  const perPage = Math.min(MAX_PER_PAGE, Math.max(1, intParam(c.req.query('perPage'), DEFAULT_PER_PAGE)))

  const where = and(publishedArticle, eq(archivedPosts.authorId, author.id))
  const [rows, total] = await Promise.all([
    selectArticles(db)
      .where(where)
      .orderBy(desc(archivedPosts.publishedAt), desc(archivedPosts.id))
      .limit(perPage)
      .offset((page - 1) * perPage),
    countArticles(db, where),
  ])
  const tagMap = await tagsByArticle(db, rows.map((r) => r.article.id))

  return c.json(
    {
      items: rows.map((r) => toArticleSummary(r, tagMap.get(r.article.id) ?? [])),
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage),
    } satisfies Schemas['PaginatedArchivedPosts'],
    200,
    publicCache(CacheFor.FRESH),
  )
})

articles.get('/users/:handle/articles/:slug', async (c) => {
  const db = c.var.db
  const author = await findAuthorOr404(c)
  const slug = c.req.param('slug')
  const row = SLUG_PATTERN.test(slug)
    ? await selectArticles(db)
        .where(and(publishedArticle, eq(archivedPosts.authorId, author.id), eq(archivedPosts.slug, slug)))
        .get()
    : undefined
  if (!row) throw notFound('記事が見つかりません。')

  const tagList = (await tagsByArticle(db, [row.article.id])).get(row.article.id) ?? []
  return c.json(toArticleDetail(row, tagList), 200, publicCache(CacheFor.FRESH))
})

// ---------- 自分の記事 ----------

function articleIdParam(c: Context<AppEnv>): number {
  const id = Number(c.req.param('id'))
  if (!Number.isSafeInteger(id) || id <= 0) throw notFound('記事が見つかりません。')
  return id
}

async function findOwnOr404(c: Context<AppEnv>): Promise<Article> {
  const article = await findOwnArticle(c.var.db, currentUser(c), articleIdParam(c))
  if (!article) throw notFound('記事が見つかりません。')
  return article
}

async function readArticleInput(c: Context<AppEnv>): Promise<ArticleInput> {
  const input = await Input.from(c)
  const title = input.string('title', {
    required: true,
    requiredMessage: 'タイトルは必須です。',
    max: MAX_ARTICLE_TITLE,
  })
  const slug = input.optionalString('slug', { max: MAX_ARTICLE_SLUG })
  if (slug && !SLUG_PATTERN.test(slug.trim().toLowerCase())) {
    input.fail('slug', 'slug は英小文字・数字・ハイフンで入力してください。')
  }
  const emoji = input.optionalString('emoji') || null
  if (emoji !== null && !isValidEmoji(emoji)) input.fail('emoji', '絵文字を1つだけ指定してください。')
  const bodyMd = input.string('bodyMd', {
    max: MAX_ARTICLE_BODY,
    maxMessage: `本文は ${MAX_ARTICLE_BODY.toLocaleString()} 文字までです。`,
  })
  const status = input.string('status', {})
  if (status !== 'draft' && status !== 'published') input.fail('status', '公開状態が不正です。')
  if (status === 'published' && bodyMd.trim() === '') input.fail('bodyMd', '本文が空のままでは公開できません。')
  const tagSlugs = input.stringList('tagSlugs', {
    maxCount: MAX_TAGS,
    maxCountMessage: `タグは ${MAX_TAGS} 個までです。`,
    pattern: SLUG_PATTERN,
    patternMessage: 'タグの slug が不正です。',
  })
  const newTags = input.stringList('newTags', {
    maxCount: MAX_TAGS,
    maxCountMessage: `タグは ${MAX_TAGS} 個までです。`,
    pattern: new RegExp(`^(?=.*\\S)[^\\p{Cc}]{1,${MAX_TAG_NAME_LENGTH}}$`, 'u'),
    patternMessage: `タグ名は ${MAX_TAG_NAME_LENGTH} 文字までです。`,
  })
  input.assertValid()

  return { title, slug, emoji, bodyMd, status: status as ArticleInput['status'], tagSlugs, newTags }
}

articles.get('/me/articles', async (c) => {
  const db = c.var.db
  const user = currentUser(c)
  const rows = await db
    .select()
    .from(archivedPosts)
    .where(eq(archivedPosts.authorId, user.id))
    .orderBy(desc(archivedPosts.updatedAt), desc(archivedPosts.id))
  const tagMap = await tagsByArticle(db, rows.map((r) => r.id))

  return c.json(
    { items: rows.map((r) => toMyArticle(r, tagMap.get(r.id) ?? [])) } satisfies Schemas['MyArticleList'],
    200,
    privateCache,
  )
})

/** 編集画面のプレビュー。保存はしない。 */
articles.post('/me/articles/preview', async (c) => {
  activeUser(c)
  const input = await Input.from(c)
  const bodyMd = input.string('bodyMd', { max: MAX_ARTICLE_BODY })
  input.assertValid()

  return c.json(
    { bodyHtml: renderArticleBody(bodyMd, c.env.SITE_HOST) } satisfies Schemas['ArticlePreview'],
    200,
    privateCache,
  )
})

articles.post('/me/articles', async (c) => {
  const db = c.var.db
  const user = activeUser(c)
  const input = await readArticleInput(c)
  await consumeRateLimit(db, 'article', user)

  const saved = await saveArticle(db, c.env.SITE_HOST, user, undefined, input)
  const tagList = (await tagsByArticle(db, [saved.id])).get(saved.id) ?? []
  return c.json(toArticleSource(saved, tagList), 201, privateCache)
})

articles.get('/me/articles/:id', async (c) => {
  const article = await findOwnOr404(c)
  const tagList = (await tagsByArticle(c.var.db, [article.id])).get(article.id) ?? []
  return c.json(toArticleSource(article, tagList), 200, privateCache)
})

articles.put('/me/articles/:id', async (c) => {
  const db = c.var.db
  const user = activeUser(c)
  const existing = await findOwnOr404(c)
  const input = await readArticleInput(c)

  const saved = await saveArticle(db, c.env.SITE_HOST, user, existing, input)
  const tagList = (await tagsByArticle(db, [saved.id])).get(saved.id) ?? []
  return c.json(toArticleSource(saved, tagList), 200, privateCache)
})

/** 削除。添付していた投稿からは外れる（posts.article_id は ON DELETE SET NULL）。 */
articles.delete('/me/articles/:id', async (c) => {
  const article = await findOwnOr404(c)
  await c.var.db.delete(archivedPosts).where(eq(archivedPosts.id, article.id))
  return c.body(null, 204)
})
