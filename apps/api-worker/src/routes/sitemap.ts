import { and, eq, isNotNull, isNull, max } from 'drizzle-orm'
import { Hono } from 'hono'
import { archivedPosts, postTags, posts, tags, users } from '../db/schema'
import type { AppEnv } from '../env'
import { CacheFor, iso, publicCache } from '../lib/http'
import { publishedArticle } from '../services/articles'
import type { Schemas } from '../services/mapper'

/**
 * サイトマップ（web の /sitemap.xml）に載せる公開ページと、その最終更新日時。
 *
 * スレッド（/@handle/:postId）は数が多く1件ごとの中身も短いので載せない。
 * 部屋のページからリンクをたどって見つけてもらう。
 */
export const sitemap = new Hono<AppEnv>()

/** 部屋・タグに並ぶ親投稿（削除・非表示・停止・退会を除く）。 */
const visibleParent = and(
  isNull(posts.parentId),
  isNull(posts.deletedAt),
  isNull(posts.hiddenAt),
  isNull(users.suspendedAt),
  isNull(users.deletedAt),
)

const entry = (path: string, lastModified: Date | null): Schemas['SitemapEntry'] | null =>
  lastModified ? { path, lastModified: iso(lastModified) } : null

const present = <T>(value: T | null): value is T => value !== null

sitemap.get('/sitemap', async (c) => {
  const db = c.var.db

  const [articleRows, roomRows, tagRows] = await Promise.all([
    db
      .select({
        slug: archivedPosts.slug,
        handle: users.handle,
        updatedAt: archivedPosts.updatedAt,
      })
      .from(archivedPosts)
      .leftJoin(users, eq(users.id, archivedPosts.authorId))
      .where(publishedArticle),
    db
      .select({ handle: users.handle, lastPostAt: max(posts.createdAt) })
      .from(posts)
      .innerJoin(users, eq(users.id, posts.authorId))
      .where(and(visibleParent, isNotNull(users.handle)))
      .groupBy(users.id),
    db
      .select({ slug: tags.slug, lastPostAt: max(posts.createdAt) })
      .from(postTags)
      .innerJoin(tags, eq(tags.id, postTags.tagId))
      .innerJoin(posts, eq(posts.id, postTags.postId))
      .innerJoin(users, eq(users.id, posts.authorId))
      .where(visibleParent)
      .groupBy(tags.id),
  ])

  // 書き手ごとの記事一覧（/@handle/articles）は、その人の記事のうち最新の更新日時
  const articleListAt = new Map<string, Date>()
  for (const row of articleRows) {
    if (!row.handle) continue
    const current = articleListAt.get(row.handle)
    if (!current || current < row.updatedAt) articleListAt.set(row.handle, row.updatedAt)
  }

  return c.json(
    {
      articles: articleRows
        .map((row) =>
          entry(
            row.handle ? `/@${row.handle}/articles/${row.slug}` : `/posts/${row.slug}`,
            row.updatedAt,
          ),
        )
        .filter(present),
      rooms: roomRows.map((row) => entry(`/@${row.handle}`, row.lastPostAt)).filter(present),
      articleLists: [...articleListAt].map(([handle, at]) => ({
        path: `/@${handle}/articles`,
        lastModified: iso(at),
      })),
      tags: tagRows.map((row) => entry(`/tags/${row.slug}`, row.lastPostAt)).filter(present),
    } satisfies Schemas['Sitemap'],
    200,
    publicCache(CacheFor.AGGREGATE),
  )
})
