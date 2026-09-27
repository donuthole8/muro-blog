import { and, asc, count, eq, isNull, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { postTags, posts, tags, users } from '../db/schema'
import type { AppEnv } from '../env'
import { CacheFor, PAGE_SIZE, likePattern, notFound, parseCursor, publicCache } from '../lib/http'
import { HANDLE_PARAM } from '../lib/policy'
import { toProfile, toRoom, toUserSummary, type Schemas } from '../services/mapper'
import {
  findLatestParentAtByAuthors,
  findLobbyPage,
  findRoomPage,
  findSearchPage,
  findTagPage,
  toPostPage,
  toPosts,
} from '../services/posts'
import {
  countFollowers,
  findRoomOwner,
  findUsersByCompanySlug,
  findUsersByIds,
  searchRoomOwners,
} from '../services/users'

/**
 * 誰でも見られる一覧（ロビー・部屋・タグ・検索・会社）。
 * 応答はログイン状態に依存しないので、エッジで共有キャッシュさせる。
 */
export const discover = new Hono<AppEnv>()

discover.get('/lobby', async (c) => {
  const db = c.var.db
  const page = await findLobbyPage(db, parseCursor(c.req.query('cursor')), PAGE_SIZE)
  return c.json(await toPostPage(db, page), 200, publicCache(CacheFor.FRESH))
})

const POPULAR_LIMIT = 10

/** 過去24時間のリアクション数＋返信数（本人以外から）の多い部屋。 */
discover.get('/rooms/popular', async (c) => {
  const db = c.var.db
  const since = Math.floor(Date.now() / 1000) - 24 * 60 * 60

  const scores = await db.all<{ author_id: string; score: number }>(sql`
    SELECT room.author_id, COUNT(*) AS score
    FROM (
      SELECT parent.author_id
      FROM reactions r
      JOIN posts p ON p.id = r.post_id
      JOIN posts parent ON parent.id = COALESCE(p.parent_id, p.id)
      WHERE r.created_at >= ${since}
        AND r.user_id <> parent.author_id
        AND parent.deleted_at IS NULL AND parent.hidden_at IS NULL
      UNION ALL
      SELECT parent.author_id
      FROM posts reply
      JOIN posts parent ON parent.id = reply.parent_id
      WHERE reply.created_at >= ${since}
        AND reply.deleted_at IS NULL
        AND reply.author_id <> parent.author_id
        AND parent.deleted_at IS NULL AND parent.hidden_at IS NULL
    ) room
    JOIN users u ON u.id = room.author_id
    WHERE u.suspended_at IS NULL AND u.deleted_at IS NULL AND u.handle IS NOT NULL
    GROUP BY room.author_id
    ORDER BY score DESC
    LIMIT ${POPULAR_LIMIT}
  `)

  const ids = scores.map((s) => s.author_id)
  const [usersById, latest] = await Promise.all([
    findUsersByIds(db, ids),
    findLatestParentAtByAuthors(db, ids),
  ])

  const rooms: Schemas['RoomSummary'][] = []
  for (const { author_id, score } of scores) {
    const user = usersById.get(author_id)
    if (user) rooms.push(toRoom(user, latest.get(author_id) ?? null, score))
  }
  return c.json(rooms, 200, publicCache(CacheFor.AGGREGATE))
})

// ---------- 部屋 ----------

discover.get('/users/:handle', async (c) => {
  const db = c.var.db
  const handle = c.req.param('handle')
  const user = HANDLE_PARAM.test(handle) ? await findRoomOwner(db, handle) : undefined
  if (!user) throw notFound('部屋が見つかりません。')

  return c.json(
    toProfile(user, await countFollowers(db, user.id)),
    200,
    publicCache(CacheFor.FRESH),
  )
})

discover.get('/users/:handle/posts', async (c) => {
  const db = c.var.db
  const handle = c.req.param('handle')
  const user = HANDLE_PARAM.test(handle) ? await findRoomOwner(db, handle) : undefined
  if (!user) throw notFound('部屋が見つかりません。')

  const page = user.suspendedAt
    ? { items: [], nextCursor: null }
    : await findRoomPage(db, user.id, parseCursor(c.req.query('cursor')), PAGE_SIZE)

  return c.json(await toPostPage(db, page), 200, publicCache(CacheFor.FRESH))
})

/** 活動グラフの日数（53 週。今日を含む週の土曜までを右端の列にする） */
const ACTIVITY_DAYS = 371
/** 日の区切りは日本時間 */
const JST_OFFSET_SECONDS = 9 * 60 * 60

const jstDate = (unixSeconds: number) => new Date((unixSeconds + JST_OFFSET_SECONDS) * 1000).toISOString().slice(0, 10)

/**
 * 部屋の活動グラフ（草）。日本時間の日ごとに、その人が書いた投稿（返信を含む）の数。
 * 0 件の日は返さない（画面側で埋める）。「今日」は SSR とブラウザでずれないよう API が決める。
 */
discover.get('/users/:handle/activity', async (c) => {
  const db = c.var.db
  const handle = c.req.param('handle')
  const user = HANDLE_PARAM.test(handle) ? await findRoomOwner(db, handle) : undefined
  if (!user) throw notFound('部屋が見つかりません。')

  const nowSec = Math.floor(Date.now() / 1000)
  const since = nowSec - ACTIVITY_DAYS * 24 * 60 * 60
  const rows = user.suspendedAt
    ? []
    : await db.all<{ day: string; n: number }>(sql`
        SELECT date(created_at + ${JST_OFFSET_SECONDS}, 'unixepoch') AS day, count(*) AS n
        FROM posts
        WHERE author_id = ${user.id} AND created_at >= ${since}
          AND deleted_at IS NULL AND hidden_at IS NULL
        GROUP BY day
      `)

  return c.json(
    {
      today: jstDate(nowSec),
      days: rows.map((r) => ({ date: r.day, count: r.n })),
      total: rows.reduce((sum, r) => sum + r.n, 0),
    } satisfies Schemas['Activity'],
    200,
    publicCache(CacheFor.AGGREGATE),
  )
})

const MENTION_LIMIT = 8

/**
 * メンションの補完候補。handle か表示名が入力で始まる人（handle の一致を先に）。
 * 打つたびに呼ばれるので、エッジで短くキャッシュする。
 */
discover.get('/mention-candidates', async (c) => {
  const db = c.var.db
  const q = (c.req.query('q') ?? '').trim().replace(/^@+/, '').slice(0, 20).toLowerCase()
  if (q === '') return c.json([], 200, publicCache(CacheFor.AGGREGATE))

  // likePattern は前後に % を付けるので、先頭の % を落として前方一致にする
  const prefix = likePattern(q).slice(1)
  const rows = await db
    .select()
    .from(users)
    .where(
      and(
        sql`${users.handle} IS NOT NULL`,
        isNull(users.suspendedAt),
        isNull(users.deletedAt),
        sql`(lower(${users.handle}) LIKE ${prefix} ESCAPE '\\' OR lower(${users.displayName}) LIKE ${prefix} ESCAPE '\\')`,
      ),
    )
    .orderBy(sql`lower(${users.handle}) LIKE ${prefix} ESCAPE '\\' DESC`, asc(users.handle))
    .limit(MENTION_LIMIT)

  return c.json(
    rows.map(toUserSummary).filter((u) => u !== null) satisfies Schemas['UserSummary'][],
    200,
    publicCache(60),
  )
})

// ---------- 会社 ----------

const ORG_LIMIT = 100

discover.get('/orgs/:slug/users', async (c) => {
  const db = c.var.db
  const slug = c.req.param('slug')
  const members = await findUsersByCompanySlug(db, slug, ORG_LIMIT)
  if (members.length === 0) throw notFound('この会社の部屋はまだありません。')

  const latest = await findLatestParentAtByAuthors(
    db,
    members.map((u) => u.id),
  )
  const rooms = members
    .map((u) => toRoom(u, latest.get(u.id) ?? null, null))
    .sort((a, b) => (b.lastPostAt ?? '').localeCompare(a.lastPostAt ?? ''))

  // 同じ slug でも表記揺れがあるので、いちばん多い表記を会社名にする
  const names = new Map<string, number>()
  for (const u of members) {
    const name = u.companyName ?? ''
    names.set(name, (names.get(name) ?? 0) + 1)
  }
  const name = [...names].sort((a, b) => b[1] - a[1])[0][0]

  return c.json(
    { slug, name, rooms } satisfies Schemas['OrgRooms'],
    200,
    publicCache(CacheFor.AGGREGATE),
  )
})

// ---------- タグ ----------

/** 全タグ（投稿0件も含む）を投稿数の多い順に。投稿時のタグ選択にも使う。 */
discover.get('/tags', async (c) => {
  const db = c.var.db
  const [all, counts] = await Promise.all([
    db.select().from(tags).orderBy(asc(tags.name)),
    db
      .select({ id: postTags.tagId, n: count() })
      .from(postTags)
      .innerJoin(posts, eq(posts.id, postTags.postId))
      .where(and(isNull(posts.deletedAt), isNull(posts.hiddenAt)))
      .groupBy(postTags.tagId),
  ])
  const countById = new Map(counts.map((r) => [r.id, r.n]))

  const result: Schemas['TagWithCount'][] = all
    .map((t) => ({ name: t.name, slug: t.slug, postCount: countById.get(t.id) ?? 0 }))
    .sort((a, b) => b.postCount - a.postCount)

  return c.json(result, 200, publicCache(CacheFor.AGGREGATE))
})

discover.get('/tags/:slug/posts', async (c) => {
  const db = c.var.db
  const slug = c.req.param('slug')
  const tag = /^[a-z0-9-]+$/.test(slug)
    ? await db.select().from(tags).where(eq(tags.slug, slug)).get()
    : undefined
  if (!tag) throw notFound('タグが見つかりません。')

  const page = await findTagPage(db, tag.id, parseCursor(c.req.query('cursor')), PAGE_SIZE)
  return c.json(
    {
      tag: { name: tag.name, slug: tag.slug },
      items: await toPosts(db, page.items),
      nextCursor: page.nextCursor,
    } satisfies Schemas['TagPostPage'],
    200,
    publicCache(CacheFor.FRESH),
  )
})

// ---------- 検索 ----------

const MAX_QUERY_LENGTH = 100
const MAX_TERMS = 5
const USER_LIMIT = 10

/** 検索語。空白（全角を含む）で区切り、すべてを含むものに絞る。 */
function searchTerms(query: string): string[] {
  const trimmed = [...query.trim()].slice(0, MAX_QUERY_LENGTH).join('')
  const terms = trimmed.split(/[\s　]+/u).filter((t) => t !== '')
  return [...new Set(terms)].slice(0, MAX_TERMS)
}

discover.get('/search', async (c) => {
  const db = c.var.db
  const terms = searchTerms(c.req.query('q') ?? '')
  if (terms.length === 0) {
    return c.json(
      { users: [], items: [], nextCursor: null } satisfies Schemas['SearchResult'],
      200,
      publicCache(CacheFor.FRESH),
    )
  }

  const cursor = parseCursor(c.req.query('cursor'))
  const [page, owners] = await Promise.all([
    findSearchPage(db, terms, cursor, PAGE_SIZE),
    // ユーザーは1ページ目にだけ出す
    cursor === null ? searchRoomOwners(db, terms, USER_LIMIT) : Promise.resolve([]),
  ])

  return c.json(
    {
      users: owners.map(toUserSummary).filter((u) => u !== null),
      items: await toPosts(db, page.items),
      nextCursor: page.nextCursor,
    } satisfies Schemas['SearchResult'],
    200,
    publicCache(CacheFor.FRESH),
  )
})
