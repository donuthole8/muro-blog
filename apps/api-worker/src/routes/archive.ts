import { and, asc, count, desc, eq, inArray, isNotNull } from 'drizzle-orm'
import { Hono } from 'hono'
import type { Db } from '../db/client'
import { archivedPostTags, archivedPosts, tags } from '../db/schema'
import type { AppEnv } from '../env'
import { CacheFor, iso, notFound, publicCache } from '../lib/http'
import type { Schemas } from '../services/mapper'

/**
 * 旧ブログの記事（読み取り専用のアーカイブ）。/posts/:slug はビルド時に静的化される。
 */
export const archive = new Hono<AppEnv>()

const DEFAULT_PER_PAGE = 10
const MAX_PER_PAGE = 50

const published = and(eq(archivedPosts.status, 'published'), isNotNull(archivedPosts.publishedAt))

type ArchivedPost = typeof archivedPosts.$inferSelect

async function tagsByPost(db: Db, ids: number[]) {
  const map = new Map<number, Schemas['TagSummary'][]>()
  if (ids.length === 0) return map
  const rows = await db
    .select({ id: archivedPostTags.archivedPostId, name: tags.name, slug: tags.slug })
    .from(archivedPostTags)
    .innerJoin(tags, eq(tags.id, archivedPostTags.tagId))
    .where(inArray(archivedPostTags.archivedPostId, ids))
    .orderBy(asc(tags.name))
  for (const { id, name, slug } of rows) {
    map.set(id, [...(map.get(id) ?? []), { name, slug }])
  }
  return map
}

function toSummary(post: ArchivedPost, tagList: Schemas['TagSummary'][]): Schemas['ArchivedPostSummary'] {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    emoji: post.emoji,
    excerpt: post.excerpt,
    publishedAt: iso(post.publishedAt),
    tags: tagList,
  }
}

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
        published,
        inArray(
          archivedPosts.id,
          db
            .select({ id: archivedPostTags.archivedPostId })
            .from(archivedPostTags)
            .innerJoin(tags, eq(tags.id, archivedPostTags.tagId))
            .where(eq(tags.slug, tagSlug)),
        ),
      )
    : published

  const [items, total] = await Promise.all([
    db
      .select()
      .from(archivedPosts)
      .where(where)
      .orderBy(desc(archivedPosts.publishedAt), desc(archivedPosts.id))
      .limit(perPage)
      .offset((page - 1) * perPage),
    db.select({ n: count() }).from(archivedPosts).where(where).get(),
  ])
  const tagMap = await tagsByPost(db, items.map((p) => p.id))
  const totalCount = total?.n ?? 0

  return c.json(
    {
      items: items.map((p) => toSummary(p, tagMap.get(p.id) ?? [])),
      total: totalCount,
      page,
      perPage,
      totalPages: Math.ceil(totalCount / perPage),
    } satisfies Schemas['PaginatedArchivedPosts'],
    200,
    publicCache(CacheFor.ARCHIVE),
  )
})

archive.get('/posts/:slug', async (c) => {
  const db = c.var.db
  const slug = c.req.param('slug')
  const post = /^[a-z0-9-]+$/.test(slug)
    ? await db.select().from(archivedPosts).where(and(published, eq(archivedPosts.slug, slug))).get()
    : undefined
  if (!post) throw notFound('記事が見つかりません。')

  const tagList = (await tagsByPost(db, [post.id])).get(post.id) ?? []
  return c.json(
    {
      ...toSummary(post, tagList),
      bodyHtml: post.bodyHtml,
      updatedAt: iso(post.updatedAt),
    } satisfies Schemas['ArchivedPostDetail'],
    200,
    publicCache(CacheFor.ARCHIVE),
  )
})

/** アーカイブ記事を持つタグを、記事数の多い順に。 */
archive.get('/tags', async (c) => {
  const db = c.var.db
  const n = count(archivedPosts.id)
  const rows = await db
    .select({ name: tags.name, slug: tags.slug, postCount: n })
    .from(tags)
    .innerJoin(archivedPostTags, eq(archivedPostTags.tagId, tags.id))
    .innerJoin(archivedPosts, eq(archivedPosts.id, archivedPostTags.archivedPostId))
    .where(eq(archivedPosts.status, 'published'))
    .groupBy(tags.id)
    .orderBy(desc(n), asc(tags.name))

  return c.json(rows satisfies Schemas['TagWithCount'][], 200, publicCache(CacheFor.ARCHIVE))
})
