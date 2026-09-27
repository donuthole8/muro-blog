import { and, asc, count, desc, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm'
import type { Db, User } from '../db/client'
import { blocks, follows, mutes, users } from '../db/schema'
import { likePattern } from '../lib/http'
import { inChunks } from './posts'

/** ユーザーまわりの読み取り（Symfony 時代の UserRepository / FollowRepository / BlockRepository）。 */

export function findUserByHandle(db: Db, handle: string) {
  return db.select().from(users).where(eq(users.handle, handle.toLowerCase())).get()
}

/** 部屋の持ち主。退会済みは部屋を持たない（停止中は「停止中」として部屋を見せる）。 */
export async function findRoomOwner(db: Db, handle: string) {
  const user = await findUserByHandle(db, handle)
  return user && !user.deletedAt ? user : undefined
}

export function findUserById(db: Db, id: string) {
  return db.select().from(users).where(eq(users.id, id)).get()
}

export async function findUsersByIds(db: Db, ids: string[]): Promise<Map<string, User>> {
  const rows = await inChunks(ids, (chunk) =>
    db.select().from(users).where(inArray(users.id, chunk)),
  )
  return new Map(rows.map((u) => [u.id, u]))
}

/** 通知を送ってよい（停止・退会していない）ユーザー。 */
export function findActiveByHandles(db: Db, handles: string[]) {
  if (handles.length === 0) return Promise.resolve([])
  return inChunks(handles, (chunk) =>
    db
      .select()
      .from(users)
      .where(and(inArray(users.handle, chunk), isNull(users.suspendedAt), isNull(users.deletedAt))),
  )
}

const roomOwners = and(isNotNull(users.handle), isNull(users.suspendedAt), isNull(users.deletedAt))

export function findUsersByCompanySlug(db: Db, slug: string, limit: number) {
  return db
    .select()
    .from(users)
    .where(and(eq(users.companySlug, slug), roomOwners))
    .orderBy(asc(users.id))
    .limit(limit)
}

export function searchRoomOwners(db: Db, terms: string[], limit: number) {
  return db
    .select()
    .from(users)
    .where(
      and(
        roomOwners,
        ...terms.map((term) => {
          const pattern = likePattern(term.replace(/^@+/, ''))
          return or(
            sql`lower(${users.handle}) LIKE ${pattern} ESCAPE '\\'`,
            sql`lower(${users.displayName}) LIKE ${pattern} ESCAPE '\\'`,
          )
        }),
      ),
    )
    .orderBy(desc(users.id))
    .limit(limit)
}

export function searchUsersForAdmin(db: Db, query: string | undefined, limit: number) {
  const q = query?.trim() ?? ''
  const pattern = likePattern(q)
  return db
    .select()
    .from(users)
    .where(
      and(
        isNull(users.deletedAt),
        q === ''
          ? undefined
          : or(
              sql`lower(${users.handle}) LIKE ${pattern} ESCAPE '\\'`,
              sql`lower(${users.displayName}) LIKE ${pattern} ESCAPE '\\'`,
            ),
      ),
    )
    .orderBy(desc(users.id))
    .limit(limit)
}

// ---------- フォロー ----------

export function findFollow(db: Db, followerId: string, followeeId: string) {
  return db
    .select()
    .from(follows)
    .where(and(eq(follows.followerId, followerId), eq(follows.followeeId, followeeId)))
    .get()
}

export async function countFollowers(db: Db, userId: string): Promise<number> {
  const row = await db.select({ n: count() }).from(follows).where(eq(follows.followeeId, userId)).get()
  return row?.n ?? 0
}

// ---------- ブロック ----------

export async function isBlocking(db: Db, blockerId: string, blockedId: string): Promise<boolean> {
  const row = await db
    .select({ id: blocks.id })
    .from(blocks)
    .where(and(eq(blocks.blockerId, blockerId), eq(blocks.blockedId, blockedId)))
    .get()
  return row !== undefined
}

export async function findBlockedHandles(db: Db, blockerId: string): Promise<string[]> {
  const rows = await db
    .select({ handle: users.handle })
    .from(blocks)
    .innerJoin(users, eq(users.id, blocks.blockedId))
    .where(and(eq(blocks.blockerId, blockerId), isNotNull(users.handle)))
  return rows.map((r) => r.handle as string)
}

/** candidates のうち、blockedId をブロックしている人の ID。 */
export async function findBlockersAmong(
  db: Db,
  candidateIds: string[],
  blockedId: string,
): Promise<Set<string>> {
  const rows = await inChunks(candidateIds, (chunk) =>
    db
      .select({ id: blocks.blockerId })
      .from(blocks)
      .where(and(eq(blocks.blockedId, blockedId), inArray(blocks.blockerId, chunk))),
  )
  return new Set(rows.map((r) => r.id))
}

/** candidates のうち、actorId をブロックかミュートしている人の ID（通知を送らない相手）。 */
export async function findSilencersAmong(
  db: Db,
  candidateIds: string[],
  actorId: string,
): Promise<Set<string>> {
  const [blockers, muters] = await Promise.all([
    findBlockersAmong(db, candidateIds, actorId),
    inChunks(candidateIds, (chunk) =>
      db
        .select({ id: mutes.muterId })
        .from(mutes)
        .where(and(eq(mutes.mutedId, actorId), inArray(mutes.muterId, chunk))),
    ),
  ])
  return new Set([...blockers, ...muters.map((r) => r.id)])
}

// ---------- ミュート ----------

export async function isMuting(db: Db, muterId: string, mutedId: string): Promise<boolean> {
  const row = await db
    .select({ id: mutes.id })
    .from(mutes)
    .where(and(eq(mutes.muterId, muterId), eq(mutes.mutedId, mutedId)))
    .get()
  return row !== undefined
}

/** userId が actorId からの通知を受け取らない（ブロックかミュートしている）か。 */
export async function isSilencing(db: Db, userId: string, actorId: string): Promise<boolean> {
  return (await isBlocking(db, userId, actorId)) || (await isMuting(db, userId, actorId))
}

export async function findMutedHandles(db: Db, muterId: string): Promise<string[]> {
  const rows = await db
    .select({ handle: users.handle })
    .from(mutes)
    .innerJoin(users, eq(users.id, mutes.mutedId))
    .where(and(eq(mutes.muterId, muterId), isNotNull(users.handle)))
  return rows.map((r) => r.handle as string)
}
