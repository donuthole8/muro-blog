import { and, asc, count, desc, eq, inArray, isNull } from 'drizzle-orm'
import { Hono } from 'hono'
import { archivedPostTags, archivedPosts, tags, users } from '../db/schema'
import type { AppEnv } from '../env'
import { CacheFor, notFound, publicCache } from '../lib/http'
import {
  countArticles,
  publishedArticle,
  selectArticles,
  tagsByArticle,
  toArticleDetail,
  toArticleSummary,
} from '../services/articles'
import type { Schemas } from '../services/mapper'

/**
 * ブログ記事の一覧（旧ブログの記事とユーザーの記事を合わせて新しい順）と、旧ブログの記事の本文。
 * ユーザーの記事の本文は routes/articles.ts（/users/:handle/articles/:slug）で返す。
 */
export const archive = new Hono<AppEnv>()

const DEFAULT_PER_PAGE = 10
const MAX_PER_PAGE = 50

const intParam = (value: string | undefined, fallback: number) => {
  const n = Number.parseInt(value ?? '', 10)
  return Number.isFinite(n) ? n : fallback
}

archive.get('/posts', async (c) => {
  const db = c.var.db
  const page = Math.max(1, intParam(c.req.query('page'), 1))
  const perPage = Math.min(MAX_PER_PAGE, Math.max(1, intParam(c.req.query('perPage'), DEFAULT_PER_PAGE)))
  const tagSlug = c.req.query('tag')

  const where = tagSlug
    ? and(
        publishedArticle,
        inArray(
          archivedPosts.id,
          db
            .select({ id: archivedPostTags.archivedPostId })
            .from(archivedPostTags)
            .innerJoin(tags, eq(tags.id, archivedPostTags.tagId))
            .where(eq(tags.slug, tagSlug)),
        ),
      )
    : publishedArticle

  const [rows, totalCount] = await Promise.all([
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
      total: totalCount,
      page,
      perPage,
      totalPages: Math.ceil(totalCount / perPage),
    } satisfies Schemas['PaginatedArchivedPosts'],
    200,
    publicCache(CacheFor.ARCHIVE),
  )
})

/** 旧ブログの記事（書き手なし）。 */
archive.get('/posts/:slug', async (c) => {
  const db = c.var.db
  const slug = c.req.param('slug')
  const row = /^[a-z0-9-]+$/.test(slug)
    ? await selectArticles(db)
        .where(and(publishedArticle, isNull(archivedPosts.authorId), eq(archivedPosts.slug, slug)))
        .get()
    : undefined
  if (!row) throw notFound('記事が見つかりません。')

  const tagList = (await tagsByArticle(db, [row.article.id])).get(row.article.id) ?? []
  return c.json(toArticleDetail(row, tagList), 200, publicCache(CacheFor.ARCHIVE))
})

/** 記事を持つタグを、記事数の多い順に。 */
archive.get('/tags', async (c) => {
  const db = c.var.db
  const n = count(archivedPosts.id)
  const rows = await db
    .select({ name: tags.name, slug: tags.slug, postCount: n })
    .from(tags)
    .innerJoin(archivedPostTags, eq(archivedPostTags.tagId, tags.id))
    .innerJoin(archivedPosts, eq(archivedPosts.id, archivedPostTags.archivedPostId))
    .leftJoin(users, eq(users.id, archivedPosts.authorId))
    .where(publishedArticle)
    .groupBy(tags.id)
    .orderBy(desc(n), asc(tags.name))

  return c.json(rows satisfies Schemas['TagWithCount'][], 200, publicCache(CacheFor.ARCHIVE))
})
