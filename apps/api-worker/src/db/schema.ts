import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

/**
 * D1（SQLite）のスキーマ。Symfony 時代の Postgres スキーマ（apps/api/migrations）を移したもの。
 *
 * - ID は ULID の文字列（26 文字）。辞書順が時刻順になるので、カーソルページングは id の比較で行う
 * - 日時は unix 秒の integer。API に出すときに ISO 8601 へ変換する
 * - enum は text のまま持つ（値の検査はアプリ側）
 */

const createdAt = () =>
  integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`)

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    googleSub: text('google_sub').unique(),
    /** メールアドレスでログインする人のアドレス（小文字に正規化済み）。Google だけの人は null */
    email: text('email').unique(),
    /** パスワードのハッシュ（lib/password.ts の形式）。email と組で使う */
    passwordHash: text('password_hash'),
    /** 部屋の URL（/@handle）。初回ログイン直後は未設定 */
    handle: text('handle').unique(),
    displayName: text('display_name').notNull(),
    avatarUrl: text('avatar_url'),
    bio: text('bio'),
    companyName: text('company_name'),
    companySlug: text('company_slug'),
    role: text('role', { enum: ['user', 'admin'] })
      .notNull()
      .default('user'),
    suspendedAt: integer('suspended_at', { mode: 'timestamp' }),
    deletedAt: integer('deleted_at', { mode: 'timestamp' }),
    createdAt: createdAt(),
  },
  (t) => [index('idx_users_company').on(t.companySlug)],
)

export const sessions = sqliteTable(
  'sessions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** トークンそのものは保存せず、SHA-256 のハッシュだけ持つ */
    tokenHash: text('token_hash').notNull().unique(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('idx_sessions_user').on(t.userId)],
)

export const tags = sqliteTable('tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
})

export const posts = sqliteTable(
  'posts',
  {
    id: text('id').primaryKey(),
    authorId: text('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 返信なら親投稿。親投稿（部屋に並ぶもの）は null */
    parentId: text('parent_id').references((): any => posts.id, {
      onDelete: 'cascade',
    }),
    bodyMarkdown: text('body_markdown').notNull(),
    bodyHtml: text('body_html').notNull(),
    imageKey: text('image_key'),
    replyCount: integer('reply_count').notNull().default(0),
    reactionCount: integer('reaction_count').notNull().default(0),
    lastReplyAt: integer('last_reply_at', { mode: 'timestamp' }),
    editedAt: integer('edited_at', { mode: 'timestamp' }),
    deletedAt: integer('deleted_at', { mode: 'timestamp' }),
    hiddenAt: integer('hidden_at', { mode: 'timestamp' }),
    createdAt: createdAt(),
  },
  (t) => [
    index('idx_posts_room')
      .on(t.authorId, t.id)
      .where(sql`${t.parentId} IS NULL`),
    index('idx_posts_lobby').on(t.id).where(sql`${t.parentId} IS NULL`),
    index('idx_posts_thread').on(t.parentId, t.id),
  ],
)

export const postTags = sqliteTable(
  'post_tags',
  {
    postId: text('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.tagId] }),
    index('idx_post_tags_tag').on(t.tagId),
  ],
)

export const reactions = sqliteTable(
  'reactions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    postId: text('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    emoji: text('emoji').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('uniq_reactions_post_user_emoji').on(
      t.postId,
      t.userId,
      t.emoji,
    ),
    index('idx_reactions_user').on(t.userId),
    index('idx_reactions_created').on(t.createdAt),
  ],
)

export const follows = sqliteTable(
  'follows',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    followerId: text('follower_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    followeeId: text('followee_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lastReadAt: integer('last_read_at', { mode: 'timestamp' }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('uniq_follows_pair').on(t.followerId, t.followeeId),
    index('idx_follows_followee').on(t.followeeId),
  ],
)

export const blocks = sqliteTable(
  'blocks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    blockerId: text('blocker_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    blockedId: text('blocked_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('uniq_blocks_pair').on(t.blockerId, t.blockedId),
    index('idx_blocks_blocked').on(t.blockedId),
  ],
)

export const notifications = sqliteTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    /** 通知を受け取る人 */
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    actorId: text('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** フォロー通知は投稿を伴わないので null */
    postId: text('post_id').references(() => posts.id, {
      onDelete: 'cascade',
    }),
    type: text('type').notNull(),
    readAt: integer('read_at', { mode: 'timestamp' }),
    createdAt: createdAt(),
  },
  (t) => [
    index('idx_notifications_user').on(t.userId, t.id),
    index('idx_notifications_unread')
      .on(t.userId)
      .where(sql`${t.readAt} IS NULL`),
    index('idx_notifications_actor').on(t.actorId),
    index('idx_notifications_post').on(t.postId),
  ],
)

export const reports = sqliteTable(
  'reports',
  {
    id: text('id').primaryKey(),
    postId: text('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    reporterId: text('reporter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reason: text('reason').notNull(),
    detail: text('detail'),
    resolution: text('resolution'),
    resolvedAt: integer('resolved_at', { mode: 'timestamp' }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('uniq_reports_post_reporter').on(t.postId, t.reporterId),
    index('idx_reports_open').on(t.id).where(sql`${t.resolvedAt} IS NULL`),
    index('idx_reports_reporter').on(t.reporterId),
  ],
)

/**
 * 書き込み系のレート制限（固定窓）。
 * Symfony では cache_items に RateLimiter の状態を入れていたが、D1 では窓ごとの回数だけ数える。
 */
export const rateLimits = sqliteTable('rate_limits', {
  /** `<action>:<userId>:<窓の開始 unix 秒>` */
  key: text('key').primaryKey(),
  count: integer('count').notNull().default(0),
  expiresAt: integer('expires_at').notNull(),
})

// ---------- 旧ブログ（読み取り専用のアーカイブ） ----------

export const archivedPosts = sqliteTable(
  'archived_posts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    emoji: text('emoji'),
    bodyMd: text('body_md').notNull(),
    bodyHtml: text('body_html').notNull(),
    excerpt: text('excerpt'),
    status: text('status', { enum: ['draft', 'published'] }).notNull(),
    publishedAt: integer('published_at', { mode: 'timestamp' }),
    createdAt: createdAt(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [
    index('idx_archived_posts_published').on(t.status, t.publishedAt),
  ],
)

export const archivedPostTags = sqliteTable(
  'archived_post_tags',
  {
    archivedPostId: integer('archived_post_id')
      .notNull()
      .references(() => archivedPosts.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.archivedPostId, t.tagId] }),
    index('idx_archived_post_tags_tag').on(t.tagId),
  ],
)
