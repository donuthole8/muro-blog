import { and, asc, count, eq, inArray, isNotNull, isNull, or, type SQL } from 'drizzle-orm'
import type { Db, User } from '../db/client'
import { archivedPostTags, archivedPosts, tags, users } from '../db/schema'
import { invalid, iso, newId, now } from '../lib/http'
import { renderArticleBody } from '../lib/markdown'
import { excerpt, toUserSummary, type Schemas } from './mapper'
import { inChunks } from './posts'
import { resolveTags } from './writer'

/**
 * ブログ記事の読み書き。テーブルは旧ブログ時代の archived_posts をそのまま使う
 * （author_id が null の行が旧ブログの記事、ある行がユーザーの記事。db/schema.ts 参照）。
 */

export type Article = typeof archivedPosts.$inferSelect
export type ArticleWithAuthor = { article: Article; author: User | null }

export const MAX_ARTICLE_TITLE = 200
export const MAX_ARTICLE_BODY = 50_000
export const MAX_ARTICLE_SLUG = 100
const EXCERPT_LENGTH = 120

/** 書き手（users）を left join して引く。旧ブログの記事は author が null になる。 */
export function selectArticles(db: Db) {
  return db
    .select({ article: archivedPosts, author: users })
    .from(archivedPosts)
    .leftJoin(users, eq(users.id, archivedPosts.authorId))
}

/** 公開中の記事。書き手が停止・退会していれば出さない（selectArticles と組で使う）。 */
export const publishedArticle = and(
  eq(archivedPosts.status, 'published'),
  isNotNull(archivedPosts.publishedAt),
  or(
    isNull(archivedPosts.authorId),
    and(isNull(users.suspendedAt), isNull(users.deletedAt)),
  ),
)

/** 条件に合う記事の件数（selectArticles と同じ join で数える）。 */
export async function countArticles(db: Db, where: SQL | undefined): Promise<number> {
  const row = await db
    .select({ n: count() })
    .from(archivedPosts)
    .leftJoin(users, eq(users.id, archivedPosts.authorId))
    .where(where)
    .get()
  return row?.n ?? 0
}

export async function tagsByArticle(db: Db, ids: number[]) {
  const map = new Map<number, Schemas['TagSummary'][]>()
  if (ids.length === 0) return map
  const rows = await inChunks(ids, (chunk) =>
    db
      .select({ id: archivedPostTags.archivedPostId, name: tags.name, slug: tags.slug })
      .from(archivedPostTags)
      .innerJoin(tags, eq(tags.id, archivedPostTags.tagId))
      .where(inArray(archivedPostTags.archivedPostId, chunk))
      .orderBy(asc(tags.name)),
  )
  for (const { id, name, slug } of rows) {
    map.set(id, [...(map.get(id) ?? []), { name, slug }])
  }
  return map
}

const authorOf = (author: User | null) => (author ? toUserSummary(author) : null)

export function toArticleSummary(
  { article, author }: ArticleWithAuthor,
  tagList: Schemas['TagSummary'][],
): Schemas['ArchivedPostSummary'] {
  return {
    id: article.id,
    slug: article.slug,
    title: article.title,
    emoji: article.emoji,
    excerpt: article.excerpt,
    publishedAt: iso(article.publishedAt),
    tags: tagList,
    author: authorOf(author),
  }
}

export function toArticleDetail(
  row: ArticleWithAuthor,
  tagList: Schemas['TagSummary'][],
): Schemas['ArchivedPostDetail'] {
  return {
    ...toArticleSummary(row, tagList),
    bodyHtml: row.article.bodyHtml,
    updatedAt: iso(row.article.updatedAt),
  }
}

export function toMyArticle(article: Article, tagList: Schemas['TagSummary'][]): Schemas['MyArticle'] {
  return {
    id: article.id,
    slug: article.slug,
    title: article.title,
    emoji: article.emoji,
    excerpt: article.excerpt,
    status: article.status,
    publishedAt: iso(article.publishedAt),
    updatedAt: iso(article.updatedAt),
    tags: tagList,
  }
}

export function toArticleSource(article: Article, tagList: Schemas['TagSummary'][]): Schemas['ArticleSource'] {
  return { ...toMyArticle(article, tagList), bodyMd: article.bodyMd }
}

/** 投稿に添付された記事のカード。非公開・削除になった記事は含めない。 */
export async function findArticleCards(db: Db, ids: number[]) {
  const unique = [...new Set(ids)]
  const rows = await inChunks(unique, (chunk) =>
    selectArticles(db).where(and(publishedArticle, inArray(archivedPosts.id, chunk))),
  )
  return new Map(
    rows.map(({ article, author }): [number, Schemas['ArticleCard']] => [
      article.id,
      {
        id: article.id,
        slug: article.slug,
        title: article.title,
        emoji: article.emoji,
        excerpt: article.excerpt,
        author: authorOf(author),
      },
    ]),
  )
}

export function findOwnArticle(db: Db, author: User, id: number) {
  return db
    .select()
    .from(archivedPosts)
    .where(and(eq(archivedPosts.id, id), eq(archivedPosts.authorId, author.id)))
    .get()
}

// ---------- 書き込み ----------

export type ArticleInput = {
  title: string
  slug: string | null
  emoji: string | null
  bodyMd: string
  status: 'draft' | 'published'
  tagSlugs: string[]
  newTags: string[]
}

/**
 * 記事を作る（existing が無いとき）か、上書きする。
 * Markdown → HTML の変換と抜粋の生成をここに集約し、bodyHtml が常に bodyMd と対応するようにする。
 */
export async function saveArticle(
  db: Db,
  siteHost: string,
  author: User,
  existing: Article | undefined,
  input: ArticleInput,
): Promise<Article> {
  const title = input.title.trim()
  if (title === '') throw invalid('title', 'タイトルは必須です。')

  // slug を空で送られたら、既存の記事ならそのまま・新しい記事なら自動で付ける
  const slug = input.slug?.trim().toLowerCase() || existing?.slug || newId().slice(-10).toLowerCase()
  const clash = await db
    .select({ id: archivedPosts.id })
    .from(archivedPosts)
    .where(and(eq(archivedPosts.authorId, author.id), eq(archivedPosts.slug, slug)))
    .get()
  if (clash && clash.id !== existing?.id) {
    throw invalid('slug', 'この slug は別の記事で使っています。')
  }

  const tagIds = await resolveTags(db, input.tagSlugs, input.newTags)
  const bodyMd = input.bodyMd.trim()
  const bodyHtml = renderArticleBody(bodyMd, siteHost)
  const updatedAt = now()
  const values = {
    slug,
    title,
    emoji: input.emoji,
    bodyMd,
    bodyHtml,
    excerpt: excerpt(bodyHtml, EXCERPT_LENGTH) || null,
    status: input.status,
    // 一度公開した日時は、下書きに戻して再公開しても変えない
    publishedAt: existing?.publishedAt ?? (input.status === 'published' ? updatedAt : null),
    updatedAt,
  }

  let saved: Article
  try {
    saved = existing
      ? await db.update(archivedPosts).set(values).where(eq(archivedPosts.id, existing.id)).returning().get()
      : await db
          .insert(archivedPosts)
          .values({ ...values, authorId: author.id, createdAt: updatedAt })
          .returning()
          .get()
  } catch (e) {
    // 同時に同じ slug で保存された場合は一意制約で弾かれる
    if (String(e).includes('UNIQUE')) throw invalid('slug', 'この slug は別の記事で使っています。')
    throw e
  }

  await db.batch([
    db.delete(archivedPostTags).where(eq(archivedPostTags.archivedPostId, saved.id)),
    ...tagIds.map((tagId) => db.insert(archivedPostTags).values({ archivedPostId: saved.id, tagId })),
  ])
  return saved
}
