import type { components } from '@blog/api-client/schema'
import type { Post, User } from '../db/client'
import { iso } from '../lib/http'

/**
 * DB の行を API のレスポンス（packages/api-client の schema.d.ts の型）に変換する。
 * Symfony 時代の TimesMapper に相当する。型は schema.d.ts が正なので、形がずれると型検査で落ちる。
 */
export type Schemas = components['schemas']

/** 投稿と投稿者（ほぼすべての一覧で一緒に要る）。 */
export type PostWithAuthor = { post: Post; author: User }

export type PostState = 'visible' | 'deleted' | 'hidden'

export function isPostVisible({ post, author }: PostWithAuthor): boolean {
  return !post.deletedAt && !post.hiddenAt && !author.suspendedAt && !author.deletedAt
}

export function postState(row: PostWithAuthor): PostState {
  if (row.post.deletedAt) return 'deleted'
  return isPostVisible(row) ? 'visible' : 'hidden'
}

export function toUserSummary(user: User): Schemas['UserSummary'] | null {
  if (user.handle === null || user.deletedAt) return null
  return { handle: user.handle, displayName: user.displayName, avatarUrl: user.avatarUrl }
}

export type PostExtras = {
  reactions?: Schemas['ReactionCount'][]
  tags?: Schemas['TagSummary'][]
  article?: Schemas['ArticleCard']
}

export function toPost(row: PostWithAuthor, extras: PostExtras = {}): Schemas['TimesPost'] {
  const { post, author } = row
  const state = postState(row)
  const visible = state === 'visible'

  return {
    id: post.id,
    parentId: post.parentId,
    author: toUserSummary(author),
    state,
    bodyHtml: visible ? post.bodyHtml : '',
    imageKey: visible ? post.imageKey : null,
    replyCount: post.replyCount,
    reactionCount: visible ? post.reactionCount : 0,
    reactions: visible ? (extras.reactions ?? []) : [],
    tags: visible ? (extras.tags ?? []) : [],
    article: visible ? (extras.article ?? null) : null,
    moderation: moderationOf(row, state),
    lastReplyAt: iso(post.lastReplyAt),
    editedAt: visible ? iso(post.editedAt) : null,
    createdAt: iso(post.createdAt),
  }
}

/**
 * 表示中なら sensitive（折りたたむ）、非表示なら Jev が非表示にしたもの（blocked）だけを出す。
 * 管理者が手で非表示にしたもの・投稿者の停止で見えないものは null のまま。
 */
function moderationOf({ post, author }: PostWithAuthor, state: PostState): Schemas['TimesPost']['moderation'] {
  if (state === 'visible') return post.moderation === 'sensitive' ? 'sensitive' : null
  if (state === 'hidden' && post.moderation === 'blocked' && !author.suspendedAt && !author.deletedAt) return 'blocked'
  return null
}

export function toProfile(user: User, followerCount: number): Schemas['UserProfile'] {
  const suspended = user.suspendedAt !== null
  return {
    handle: user.handle ?? '',
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bio: suspended ? null : user.bio,
    companyName: suspended ? null : user.companyName,
    companySlug: suspended ? null : user.companySlug,
    followerCount,
    suspended,
    createdAt: iso(user.createdAt),
  }
}

export function toRoom(
  user: User,
  lastPostAt: Date | null,
  count: number | null,
): Schemas['RoomSummary'] {
  const summary = toUserSummary(user)
  if (!summary) throw new Error('退会済みユーザーは部屋を持たない')
  return {
    user: summary,
    bio: user.bio,
    companyName: user.companyName,
    lastPostAt: iso(lastPostAt),
    count,
  }
}

export function toMe(user: User, unreadNotificationCount: number): Schemas['Me'] {
  return {
    id: user.id,
    handle: user.handle,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    companyName: user.companyName,
    companySlug: user.companySlug,
    role: user.role,
    unreadNotificationCount,
  }
}

export function toAdminUser(user: User): Schemas['AdminUser'] {
  return {
    id: user.id,
    handle: user.handle,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    role: user.role,
    suspendedAt: iso(user.suspendedAt),
    createdAt: iso(user.createdAt),
  }
}

export function toAdminPost({ post, author }: PostWithAuthor): Schemas['AdminPost'] {
  return {
    id: post.id,
    parentId: post.parentId,
    author: toAdminUser(author),
    bodyMarkdown: post.bodyMarkdown,
    imageKey: post.imageKey,
    hiddenAt: iso(post.hiddenAt),
    moderation: post.moderation,
    moderationCategory: post.moderationCategory,
    moderationScore: post.moderationScore,
    createdAt: iso(post.createdAt),
  }
}

/** HTML から、通知や OGP に使うプレーンテキストの抜粋を作る。 */
export function excerpt(html: string, length = 80): string {
  const text = decodeEntities(html.replace(/<[^>]*>/g, ''))
    .replace(/\s+/gu, ' ')
    .trim()
  const chars = [...text]
  return chars.length > length ? `${chars.slice(0, length).join('')}…` : text
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code =
        entity[1] === 'x' || entity[1] === 'X'
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match
  })
}
