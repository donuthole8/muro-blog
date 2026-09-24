import { and, count, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import type { Db, Post, User } from '../db/client'
import { archivedPosts, notifications, postTags, posts, tags } from '../db/schema'
import { forbidden, invalid, newId, notFound, now } from '../lib/http'
import { embedLinkCards, hasBareLink } from '../lib/linkCards'
import { mentionCandidates, renderPostBody } from '../lib/markdown'
import { consumeRateLimit } from '../lib/rateLimit'
import { isPostVisible, type PostWithAuthor } from './mapper'
import { findPostById } from './posts'
import { findActiveByHandles, findBlockersAmong, isBlocking } from './users'

/**
 * times の投稿の作成・編集・削除（Symfony 時代の TimesPostWriter と Notifier）。
 *
 * Markdown → HTML の変換をここに集約し、「保存された bodyHtml は必ず bodyMarkdown と
 * 対応している」ことを保証する。カウンタ（reply_count）と通知もここで動かす。
 * D1 は対話的なトランザクションを持たないので、まとめて書く必要があるものは batch で送る。
 */

export const MAX_BODY_LENGTH = 2000
export const MAX_TAGS = 3

/** web の画像アップロード（lib/uploads.ts）が作るキーの形。先頭は投稿者の ID。 */
const IMAGE_KEY_PATTERN = /^u_([0-9A-HJKMNP-TV-Z]{26})_[0-9a-f-]{36}\.(?:webp|jpg|png|gif)$/

export type WriterContext = {
  db: Db
  siteHost: string
  /** レスポンス後の処理（リンクカードの取得）を積む */
  waitUntil: (promise: Promise<unknown>) => void
}

type Batch = BatchItem<'sqlite'>[]

export type PostInput = {
  bodyMarkdown: string
  parentId: string | null
  imageKey: string | null
  tagSlugs: string[]
  /** 新しく作るタグの名前（既にあればそれを使う） */
  newTags?: string[]
  /** 添付する公開中のブログ記事 */
  articleId?: number | null
}

export async function createPost(
  ctx: WriterContext,
  author: User & { handle: string },
  input: PostInput,
): Promise<PostWithAuthor> {
  const { db } = ctx
  const body = input.bodyMarkdown.trim()
  const articleId = input.articleId ?? null
  if (body === '' && input.imageKey === null && articleId === null) {
    throw invalid('bodyMarkdown', '本文・画像・記事のどれかは必要です。')
  }

  let parent: PostWithAuthor | undefined
  if (input.parentId !== null) {
    parent = await findPostById(db, input.parentId)
    if (!parent || parent.post.parentId !== null) {
      // 返信への返信は作らない（スレッドは1階層）
      throw invalid('parentId', '返信先の投稿が見つかりません。')
    }
    if (!isPostVisible(parent)) {
      throw invalid('parentId', '削除・非表示になった投稿には返信できません。')
    }
    if (input.tagSlugs.length > 0 || (input.newTags ?? []).length > 0) {
      throw invalid('tagSlugs', '返信にはタグを付けられません。')
    }
    if (await isBlocking(db, parent.author.id, author.id)) {
      throw forbidden('この投稿には返信できません。')
    }
  }

  const imageKey = validImageKey(author, input.imageKey)
  if (articleId !== null) await assertAttachableArticle(db, articleId)
  const tagIds = await resolveTags(db, input.tagSlugs, input.newTags ?? [])

  // 入力の検証を通ったものだけを数える（打ち間違いで枠を減らさない）
  await consumeRateLimit(db, 'post', author)

  const rendered = await render(ctx, body)
  const createdAt = now()
  const post: Post = {
    id: newId(),
    authorId: author.id,
    parentId: parent?.post.id ?? null,
    bodyMarkdown: body,
    bodyHtml: rendered.html,
    imageKey,
    articleId,
    replyCount: 0,
    reactionCount: 0,
    lastReplyAt: null,
    editedAt: null,
    deletedAt: null,
    hiddenAt: null,
    createdAt,
  }

  const statements: Batch = [db.insert(posts).values(post)]
  if (tagIds.length > 0) {
    statements.push(db.insert(postTags).values(tagIds.map((tagId) => ({ postId: post.id, tagId }))))
  }
  statements.push(...(await postNotifications(db, post, author, parent, rendered.mentionedHandles)))
  if (parent) {
    statements.push(
      db
        .update(posts)
        .set({ replyCount: replyCountOf(parent.post.id), lastReplyAt: createdAt })
        .where(eq(posts.id, parent.post.id)),
    )
  }
  await db.batch(statements as [Batch[number], ...Batch])

  scheduleLinkCards(ctx, post)
  return { post, author }
}

export async function updatePost(
  ctx: WriterContext,
  editor: User & { handle: string },
  row: PostWithAuthor,
  input: { bodyMarkdown: string; tagSlugs: string[]; newTags?: string[] },
): Promise<PostWithAuthor> {
  const { db } = ctx
  assertOwner(editor, row.post)
  if (!isPostVisible(row)) throw notFound()

  const body = input.bodyMarkdown.trim()
  if (body === '' && row.post.imageKey === null) {
    throw invalid('bodyMarkdown', '本文は空にできません。')
  }
  if (row.post.parentId !== null && (input.tagSlugs.length > 0 || (input.newTags ?? []).length > 0)) {
    throw invalid('tagSlugs', '返信にはタグを付けられません。')
  }
  const tagIds = await resolveTags(db, input.tagSlugs, input.newTags ?? [])

  // 編集ではメンション通知を飛ばし直さない（編集のたびに通知が飛ぶのを防ぐ）
  const rendered = await render(ctx, body)
  const post: Post = { ...row.post, bodyMarkdown: body, bodyHtml: rendered.html, editedAt: now() }

  const statements: Batch = [
    db
      .update(posts)
      .set({ bodyMarkdown: post.bodyMarkdown, bodyHtml: post.bodyHtml, editedAt: post.editedAt })
      .where(eq(posts.id, post.id)),
    db.delete(postTags).where(eq(postTags.postId, post.id)),
  ]
  if (tagIds.length > 0) {
    statements.push(db.insert(postTags).values(tagIds.map((tagId) => ({ postId: post.id, tagId }))))
  }
  await db.batch(statements as [Batch[number], ...Batch])

  scheduleLinkCards(ctx, post)
  return { post, author: row.author }
}

/**
 * 論理削除。本文・画像・タグを消し、返信数を数え直す。
 * 消えた画像のキーを返す（R2 からの削除は web の Worker が行う）。
 */
export function deletePostStatements(db: Db, post: Post): Batch {
  const statements: Batch = [
    db
      .update(posts)
      .set({ deletedAt: post.deletedAt ?? now(), bodyMarkdown: '', bodyHtml: '', imageKey: null, articleId: null })
      .where(eq(posts.id, post.id)),
    db.delete(postTags).where(eq(postTags.postId, post.id)),
  ]
  if (post.parentId !== null) {
    statements.push(
      db.update(posts).set({ replyCount: replyCountOf(post.parentId) }).where(eq(posts.id, post.parentId)),
    )
  }
  return statements
}

export async function deletePost(db: Db, post: Post): Promise<string | null> {
  if (post.deletedAt) return null
  await db.batch(deletePostStatements(db, post) as [Batch[number], ...Batch])
  return post.imageKey
}

export async function deletePostAsAuthor(db: Db, user: User, post: Post): Promise<string | null> {
  assertOwner(user, post)
  return deletePost(db, post)
}

/** 表示中の返信の数（増減ではなく数え直すので、途中で失敗してもずれない）。 */
function replyCountOf(parentId: string) {
  return sql`(SELECT count(*) FROM posts WHERE parent_id = ${parentId} AND deleted_at IS NULL)`
}

function assertOwner(user: User, post: Post) {
  if (post.authorId !== user.id) throw forbidden('自分の投稿しか編集・削除できません。')
}

function validImageKey(author: User, key: string | null): string | null {
  if (key === null || key === '') return null
  // 他人のアップロードを自分の投稿に付けられないよう、キーに埋めた投稿者 ID を照合する
  const m = IMAGE_KEY_PATTERN.exec(key)
  if (!m || m[1] !== author.id) {
    throw invalid('imageKey', '画像の指定が不正です。アップロードし直してください。')
  }
  return key
}

/** 添付できるのは公開中の記事だけ（他人の記事でもよい）。 */
async function assertAttachableArticle(db: Db, id: number) {
  const article = await db
    .select({ id: archivedPosts.id })
    .from(archivedPosts)
    .where(and(eq(archivedPosts.id, id), eq(archivedPosts.status, 'published')))
    .get()
  if (!article) throw invalid('articleId', '記事が見つからないか、公開されていません。')
}

export async function resolveTags(db: Db, slugs: string[], newNames: string[]): Promise<number[]> {
  const unique = [...new Set(slugs)]
  const ids: number[] = []
  if (unique.length > 0) {
    const found = await db.select().from(tags).where(inArray(tags.slug, unique))
    if (found.length !== unique.length) {
      const have = new Set(found.map((t) => t.slug))
      const missing = unique.filter((s) => !have.has(s)).join(', ')
      throw invalid('tagSlugs', `タグ ${missing} は存在しません。`)
    }
    ids.push(...found.map((t) => t.id))
  }

  const names = [...new Set(newNames.map(normalizeTagName).filter((n) => n !== ''))]
  for (const name of names) {
    const id = await findOrCreateTag(db, name)
    if (!ids.includes(id)) ids.push(id)
  }
  if (ids.length > MAX_TAGS) throw invalid('tagSlugs', `タグは ${MAX_TAGS} 個までです。`)
  return ids
}

export const MAX_TAG_NAME_LENGTH = 32

/** 先頭の # と前後の空白を落とし、途中の空白は1つのハイフンにまとめる。 */
export function normalizeTagName(raw: string): string {
  return raw
    .trim()
    .replace(/^#+/, '')
    .trim()
    .replace(/\s+/g, '-')
}

/**
 * 名前でタグを引き、無ければ作る。slug は英数字の名前ならそのまま小文字にし、
 * 日本語などで作れなければ名前のハッシュから作る（URL に使うので英小文字・数字・ハイフンのみ）。
 */
async function findOrCreateTag(db: Db, name: string): Promise<number> {
  const existing = await db.select().from(tags).where(eq(sql`lower(${tags.name})`, name.toLowerCase())).get()
  if (existing) return existing.id

  const ascii = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const hashed = `t-${await shortHash(name)}`
  const candidates = ascii !== '' && ascii.length <= 64 ? [ascii, `${ascii}-${await shortHash(name)}`] : [hashed]

  for (const slug of candidates) {
    // 同時に同じ名前で作られても一意制約で弾かれるだけにする
    await db.insert(tags).values({ name, slug }).onConflictDoNothing()
    const row = await db.select().from(tags).where(eq(tags.name, name)).get()
    if (row) return row.id
  }
  throw invalid('tagSlugs', `タグ「${name}」を作れませんでした。`)
}

async function shortHash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest).slice(0, 4), (b) => b.toString(16).padStart(2, '0')).join('')
}

async function render(ctx: WriterContext, markdown: string) {
  // 実在するユーザーだけをリンクにするため、候補の handle を先にまとめて引く
  const known = await findActiveByHandles(ctx.db, mentionCandidates(markdown))
  return renderPostBody(
    markdown,
    known.map((u) => u.handle as string),
    ctx.siteHost,
  )
}

/** 裸 URL のリンクカードを、レスポンスを返した後で埋める。 */
function scheduleLinkCards(ctx: WriterContext, post: Post) {
  if (!hasBareLink(post.bodyHtml)) return
  ctx.waitUntil(fillLinkCards(ctx.db, post.id).catch((e) => console.warn('link card fill failed', post.id, e)))
}

export async function fillLinkCards(db: Db, postId: string): Promise<boolean> {
  const row = await db.select().from(posts).where(eq(posts.id, postId)).get()
  if (!row || row.deletedAt) return false
  const html = await embedLinkCards(row.bodyHtml)
  if (html === row.bodyHtml) return false
  // 取得中に編集されていたら上書きしない
  await db
    .update(posts)
    .set({ bodyHtml: html })
    .where(and(eq(posts.id, postId), eq(posts.bodyHtml, row.bodyHtml)))
  return true
}

// ---------- 通知 ----------

type NotificationType = 'reply' | 'mention' | 'reaction' | 'follow'

function notification(userId: string, type: NotificationType, actorId: string, postId: string | null) {
  return { id: newId(), userId, type, actorId, postId, readAt: null, createdAt: now() }
}

const isActive = (user: User) => user.handle !== null && !user.suspendedAt && !user.deletedAt

/**
 * 投稿の作成時。返信なら親投稿の持ち主へ、本文の @handle へはメンションとして。
 * 親投稿の持ち主がメンションもされていたら、通知は返信の1件にまとめる。
 * 自分自身と、投稿者をブロックしている人には通知しない。
 */
async function postNotifications(
  db: Db,
  post: Post,
  actor: User,
  parent: PostWithAuthor | undefined,
  mentionedHandles: string[],
): Promise<Batch> {
  const replyTo = parent && isPostVisible(parent) ? parent.author : null
  const mentioned = await findActiveByHandles(db, mentionedHandles)
  const candidates = replyTo ? [replyTo, ...mentioned] : mentioned

  const notified = new Set([actor.id, ...(await findBlockersAmong(db, candidates.map((u) => u.id), actor.id))])
  const rows: ReturnType<typeof notification>[] = []
  const push = (to: User, type: NotificationType) => {
    if (notified.has(to.id) || !isActive(to)) return
    notified.add(to.id)
    rows.push(notification(to.id, type, actor.id, post.id))
  }

  if (replyTo) push(replyTo, 'reply')
  for (const user of mentioned) push(user, 'mention')

  return rows.length > 0 ? [db.insert(notifications).values(rows)] : []
}

/** リアクションが付いたとき。同じ人・同じ投稿の未読の通知があれば重ねない。 */
export async function notifyReaction(db: Db, { post, author: owner }: PostWithAuthor, actor: User) {
  if (owner.id === actor.id || (await isBlocking(db, owner.id, actor.id))) return

  const duplicate = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, owner.id),
        eq(notifications.actorId, actor.id),
        eq(notifications.postId, post.id),
        eq(notifications.type, 'reaction'),
        isNull(notifications.readAt),
      ),
    )
    .get()
  if (duplicate) return

  await db.insert(notifications).values(notification(owner.id, 'reaction', actor.id, post.id))
}

/** 部屋がフォローされたとき。付け外しを繰り返しても通知は1回だけ。 */
export async function followNotification(db: Db, followee: User, follower: User): Promise<Batch> {
  if (!isActive(followee)) return []
  const existing = await db
    .select({ n: count() })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, followee.id),
        eq(notifications.actorId, follower.id),
        eq(notifications.type, 'follow'),
      ),
    )
    .get()
  if ((existing?.n ?? 0) > 0) return []
  return [db.insert(notifications).values(notification(followee.id, 'follow', follower.id, null))]
}
