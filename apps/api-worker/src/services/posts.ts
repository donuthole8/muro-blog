import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
import type { Db } from '../db/client'
import { postTags, posts, reactions, tags, users } from '../db/schema'
import { likePattern, toPage } from '../lib/http'
import { findArticleCards } from './articles'
import {
  isPostVisible,
  toPost,
  type PostWithAuthor,
  type Schemas,
} from './mapper'

/**
 * 投稿の読み取り（Symfony 時代の PostRepository の読み取り部分）。
 */

/** D1 は1クエリのバインド変数が 100 個まで。IN 句に渡す ID はこの単位で分ける。 */
const MAX_IN = 90

export async function inChunks<T, R>(
  items: T[],
  fn: (chunk: T[]) => Promise<R[]>,
): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += MAX_IN) {
    results.push(...(await fn(items.slice(i, i + MAX_IN))))
  }
  return results
}

function selectPosts(db: Db) {
  return db
    .select({ post: posts, author: users })
    .from(posts)
    .innerJoin(users, eq(users.id, posts.authorId))
}

/** 公開の一覧に並ぶ親投稿（削除・非表示・停止・退会を除く）。 */
const visibleParents = and(
  isNull(posts.parentId),
  isNull(posts.deletedAt),
  isNull(posts.hiddenAt),
  isNull(users.suspendedAt),
  isNull(users.deletedAt),
)

async function page(db: Db, where: SQL | undefined, cursor: string | null, limit: number) {
  const rows = await selectPosts(db)
    .where(and(where, cursor ? lt(posts.id, cursor) : undefined))
    .orderBy(desc(posts.id))
    .limit(limit + 1)
  return toPage(rows.map(withId), limit)
}

const withId = (row: PostWithAuthor) => Object.assign(row, { id: row.post.id })

export function findLobbyPage(db: Db, cursor: string | null, limit: number) {
  return page(db, visibleParents, cursor, limit)
}

export function findRoomPage(db: Db, authorId: string, cursor: string | null, limit: number) {
  // 削除・非表示になっても、返信が付いているものは「削除されました」として残す
  return page(
    db,
    and(
      eq(posts.authorId, authorId),
      isNull(posts.parentId),
      or(and(isNull(posts.deletedAt), isNull(posts.hiddenAt)), gt(posts.replyCount, 0)),
    ),
    cursor,
    limit,
  )
}

export function findTagPage(db: Db, tagId: number, cursor: string | null, limit: number) {
  return page(
    db,
    and(
      visibleParents,
      inArray(posts.id, db.select({ id: postTags.postId }).from(postTags).where(eq(postTags.tagId, tagId))),
    ),
    cursor,
    limit,
  )
}

/** 検索語をすべて含む親投稿。件数が少ないうちは LIKE の全件走査で足りる。 */
export function findSearchPage(db: Db, terms: string[], cursor: string | null, limit: number) {
  return page(
    db,
    and(
      visibleParents,
      ...terms.map((term) => sql`lower(${posts.bodyMarkdown}) LIKE ${likePattern(term)} ESCAPE '\\'`),
    ),
    cursor,
    limit,
  )
}

export function findForModeration(
  db: Db,
  cursor: string | null,
  limit: number,
  authorId: string | null,
) {
  return page(
    db,
    and(isNull(posts.deletedAt), authorId ? eq(posts.authorId, authorId) : undefined),
    cursor,
    limit,
  )
}

export async function findPostById(db: Db, id: string): Promise<PostWithAuthor | undefined> {
  return selectPosts(db).where(eq(posts.id, id)).get()
}

export function findReplies(db: Db, parentId: string): Promise<PostWithAuthor[]> {
  return selectPosts(db)
    .where(and(eq(posts.parentId, parentId), isNull(posts.deletedAt)))
    .orderBy(asc(posts.id))
}

/** 著者ごとの、最新の（表示中の）親投稿の日時。 */
export async function findLatestParentAtByAuthors(
  db: Db,
  userIds: string[],
): Promise<Map<string, Date>> {
  const rows = await inChunks(userIds, (ids) =>
    db
      .select({ authorId: posts.authorId, latest: sql<number>`max(${posts.createdAt})` })
      .from(posts)
      .where(
        and(
          inArray(posts.authorId, ids),
          isNull(posts.parentId),
          isNull(posts.deletedAt),
          isNull(posts.hiddenAt),
        ),
      )
      .groupBy(posts.authorId),
  )
  return new Map(rows.map((r) => [r.authorId, new Date(r.latest * 1000)]))
}

// ---------- 一覧の組み立て ----------

/** 投稿ごとのリアクション数（絵文字ごと、最初に付いた順）。 */
async function countReactionsByPosts(db: Db, postIds: string[]) {
  const rows = await inChunks(postIds, (ids) =>
    db
      .select({
        postId: reactions.postId,
        emoji: reactions.emoji,
        count: sql<number>`count(*)`,
        firstId: sql<number>`min(${reactions.id})`,
      })
      .from(reactions)
      .where(inArray(reactions.postId, ids))
      .groupBy(reactions.postId, reactions.emoji),
  )
  rows.sort((a, b) => a.firstId - b.firstId)

  const result = new Map<string, Schemas['ReactionCount'][]>()
  for (const row of rows) {
    const list = result.get(row.postId) ?? []
    list.push({ emoji: row.emoji, count: row.count })
    result.set(row.postId, list)
  }
  return result
}

/** 投稿ごとのタグ（名前順）。 */
export async function findTagsByPosts(db: Db, postIds: string[]) {
  const rows = await inChunks(postIds, (ids) =>
    db
      .select({ postId: postTags.postId, name: tags.name, slug: tags.slug })
      .from(postTags)
      .innerJoin(tags, eq(tags.id, postTags.tagId))
      .where(inArray(postTags.postId, ids))
      .orderBy(asc(tags.name)),
  )
  const result = new Map<string, Schemas['TagSummary'][]>()
  for (const { postId, name, slug } of rows) {
    const list = result.get(postId) ?? []
    list.push({ name, slug })
    result.set(postId, list)
  }
  return result
}

/** 行を API の TimesPost にする。表示できる投稿のリアクションとタグをまとめて引く。 */
export async function toPosts(db: Db, rows: PostWithAuthor[]): Promise<Schemas['TimesPost'][]> {
  const visible = rows.filter(isPostVisible)
  const visibleIds = visible.map((r) => r.post.id)
  const parentIds = visible.filter((r) => r.post.parentId === null).map((r) => r.post.id)

  const articleIds = visible.flatMap((r) => (r.post.articleId !== null ? [r.post.articleId] : []))

  const [reactionCounts, tagsByPost, articleCards] = await Promise.all([
    countReactionsByPosts(db, visibleIds),
    findTagsByPosts(db, parentIds),
    findArticleCards(db, articleIds),
  ])

  return rows.map((row) =>
    toPost(row, {
      reactions: reactionCounts.get(row.post.id),
      tags: tagsByPost.get(row.post.id),
      article: row.post.articleId !== null ? articleCards.get(row.post.articleId) : undefined,
    }),
  )
}

export async function toPostPage(
  db: Db,
  { items, nextCursor }: { items: PostWithAuthor[]; nextCursor: string | null },
): Promise<Schemas['PostPage']> {
  return { items: await toPosts(db, items), nextCursor }
}
