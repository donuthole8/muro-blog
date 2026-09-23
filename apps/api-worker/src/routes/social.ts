import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { alias } from 'drizzle-orm/sqlite-core'
import { Hono, type Context } from 'hono'
import { blocks, follows, notifications, posts, users } from '../db/schema'
import type { AppEnv } from '../env'
import { activeUser, currentUser } from '../lib/auth'
import { PAGE_SIZE, forbidden, iso, notFound, now, parseCursor, privateCache, toPage } from '../lib/http'
import { HANDLE_PARAM } from '../lib/policy'
import { excerpt, isPostVisible, toRoom, toUserSummary, type PostWithAuthor, type Schemas } from '../services/mapper'
import { inChunks } from '../services/posts'
import { findFollow, findRoomOwner, findUserByHandle, findUsersByIds, isBlocking } from '../services/users'
import { followNotification } from '../services/writer'
import { countUnread } from './me'

/** フォロー・ブロック・通知（すべてログイン必須、応答は本人専用）。 */
export const social = new Hono<AppEnv>()

function handleParam(c: Context<AppEnv>): string {
  const handle = c.req.param('handle') ?? ''
  if (!HANDLE_PARAM.test(handle)) throw notFound()
  return handle
}

// ---------- フォロー ----------

social.put('/follows/:handle', async (c) => {
  const db = c.var.db
  const me = activeUser(c)
  const owner = await findRoomOwner(db, handleParam(c))
  if (!owner || owner.id === me.id) throw notFound('部屋が見つかりません。')
  if ((await isBlocking(db, owner.id, me.id)) || (await isBlocking(db, me.id, owner.id))) {
    throw forbidden('この部屋はフォローできません。')
  }

  if (!(await findFollow(db, me.id, owner.id))) {
    const at = now()
    await db.batch([
      db
        .insert(follows)
        .values({ followerId: me.id, followeeId: owner.id, lastReadAt: at, createdAt: at })
        .onConflictDoNothing(),
      ...(await followNotification(db, owner, me)),
    ] as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
  }
  return c.body(null, 204)
})

social.delete('/follows/:handle', async (c) => {
  const db = c.var.db
  const me = currentUser(c)
  const owner = await findUserByHandle(db, handleParam(c))
  if (owner) {
    await db.delete(follows).where(and(eq(follows.followerId, me.id), eq(follows.followeeId, owner.id)))
  }
  return c.body(null, 204)
})

/** 部屋を開いたとき。未読数を 0 に戻す。 */
social.post('/follows/:handle/read', async (c) => {
  const db = c.var.db
  const me = currentUser(c)
  const owner = await findUserByHandle(db, handleParam(c))
  if (owner) {
    await db
      .update(follows)
      .set({ lastReadAt: now() })
      .where(and(eq(follows.followerId, me.id), eq(follows.followeeId, owner.id)))
  }
  return c.body(null, 204)
})

/** フォロー中の部屋と未読数（count）。未読の多い順。 */
social.get('/following', async (c) => {
  const db = c.var.db
  const me = currentUser(c)

  const rows = await db.all<{ followee_id: string; unread: number; last_post_at: number | null }>(sql`
    SELECT f.followee_id,
           COALESCE(SUM(CASE WHEN p.created_at > f.last_read_at THEN 1 ELSE 0 END), 0) AS unread,
           MAX(p.created_at) AS last_post_at
    FROM follows f
    JOIN users u ON u.id = f.followee_id AND u.deleted_at IS NULL
    LEFT JOIN posts p ON p.author_id = f.followee_id
        AND p.parent_id IS NULL AND p.deleted_at IS NULL AND p.hidden_at IS NULL
    WHERE f.follower_id = ${me.id}
    GROUP BY f.followee_id, f.id
    ORDER BY unread DESC, last_post_at IS NULL, last_post_at DESC, f.id DESC
  `)

  const usersById = await findUsersByIds(db, rows.map((r) => r.followee_id))
  const rooms: Schemas['RoomSummary'][] = []
  for (const row of rows) {
    const user = usersById.get(row.followee_id)
    if (user && user.handle !== null && !user.suspendedAt) {
      rooms.push(
        toRoom(user, row.last_post_at === null ? null : new Date(row.last_post_at * 1000), row.unread),
      )
    }
  }
  return c.json(rooms, 200, privateCache)
})

// ---------- ブロック ----------

social.put('/blocks/:handle', async (c) => {
  const db = c.var.db
  const me = activeUser(c)
  const target = await findUserByHandle(db, handleParam(c))
  if (!target || target.id === me.id) throw notFound('ユーザーが見つかりません。')

  // ブロックしたら、お互いのフォローも外す
  await db.batch([
    db.insert(blocks).values({ blockerId: me.id, blockedId: target.id, createdAt: now() }).onConflictDoNothing(),
    db.delete(follows).where(and(eq(follows.followerId, me.id), eq(follows.followeeId, target.id))),
    db.delete(follows).where(and(eq(follows.followerId, target.id), eq(follows.followeeId, me.id))),
  ])
  return c.body(null, 204)
})

social.delete('/blocks/:handle', async (c) => {
  const db = c.var.db
  const me = currentUser(c)
  const target = await findUserByHandle(db, handleParam(c))
  if (target) {
    await db.delete(blocks).where(and(eq(blocks.blockerId, me.id), eq(blocks.blockedId, target.id)))
  }
  return c.body(null, 204)
})

/** ブロック中のユーザー（新しい順）。 */
social.get('/blocks', async (c) => {
  const db = c.var.db
  const me = currentUser(c)
  const rows = await db
    .select({ user: users, createdAt: blocks.createdAt })
    .from(blocks)
    .innerJoin(users, eq(users.id, blocks.blockedId))
    .where(and(eq(blocks.blockerId, me.id), isNull(users.deletedAt)))
    .orderBy(desc(blocks.id))

  const items: Schemas['BlockedUser'][] = []
  for (const row of rows) {
    const user = toUserSummary(row.user)
    if (user) items.push({ user, blockedAt: iso(row.createdAt) })
  }
  return c.json(items, 200, privateCache)
})

// ---------- 通知 ----------

const actors = alias(users, 'actor')
const postAuthors = alias(users, 'post_author')

/** 投稿と投稿者を ID でまとめて引く。 */
async function findPostsByIds(db: AppEnv['Variables']['db'], ids: string[]) {
  const rows = await inChunks(ids, (chunk) =>
    db
      .select({ post: posts, author: postAuthors })
      .from(posts)
      .innerJoin(postAuthors, eq(postAuthors.id, posts.authorId))
      .where(inArray(posts.id, chunk)),
  )
  return new Map<string, PostWithAuthor>(rows.map((r) => [r.post.id, r]))
}

social.get('/notifications', async (c) => {
  const db = c.var.db
  const me = currentUser(c)
  const cursor = parseCursor(c.req.query('cursor'))

  const rows = await db
    .select({ notification: notifications, actor: actors })
    .from(notifications)
    .innerJoin(actors, eq(actors.id, notifications.actorId))
    .where(and(eq(notifications.userId, me.id), cursor ? lt(notifications.id, cursor) : undefined))
    .orderBy(desc(notifications.id))
    .limit(PAGE_SIZE + 1)
  const page = toPage(
    rows.map((r) => Object.assign(r, { id: r.notification.id })),
    PAGE_SIZE,
  )

  // 通知の投稿と、それが返信ならスレッドの親投稿
  const postsById = await findPostsByIds(db, [
    ...new Set(page.items.flatMap((r) => (r.notification.postId ? [r.notification.postId] : []))),
  ])
  const parentIds = [...postsById.values()].flatMap((r) =>
    r.post.parentId && !postsById.has(r.post.parentId) ? [r.post.parentId] : [],
  )
  for (const [id, row] of await findPostsByIds(db, [...new Set(parentIds)])) postsById.set(id, row)

  const items = page.items.map(({ notification: n, actor }): Schemas['NotificationItem'] => {
    const post = n.postId ? postsById.get(n.postId) : undefined
    const thread = post?.post.parentId ? postsById.get(post.post.parentId) : post
    return {
      id: n.id,
      type: n.type as Schemas['NotificationItem']['type'],
      actor: toUserSummary(actor),
      postId: post?.post.id ?? null,
      threadId: thread?.post.id ?? null,
      threadHandle: thread?.author.handle ?? null,
      excerpt: !post ? '' : isPostVisible(post) ? excerpt(post.post.bodyHtml) : '（表示できない投稿です）',
      readAt: iso(n.readAt),
      createdAt: iso(n.createdAt),
    }
  })

  return c.json(
    {
      items,
      nextCursor: page.nextCursor,
      unreadCount: await countUnread(db, me.id),
    } satisfies Schemas['NotificationPage'],
    200,
    privateCache,
  )
})

social.post('/notifications/read', async (c) => {
  const me = currentUser(c)
  await c.var.db
    .update(notifications)
    .set({ readAt: now() })
    .where(and(eq(notifications.userId, me.id), isNull(notifications.readAt)))
  return c.body(null, 204)
})
