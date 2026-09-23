import { eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import type { User } from '../db/client'
import { follows, posts, reactions, tags, users } from '../db/schema'
import type { AppEnv } from '../env'
import { newId, notFound, now } from '../lib/http'
import { companySlug } from '../lib/policy'
import { findUserByHandle } from '../services/users'
import { createPost, notifyReaction, type WriterContext } from '../services/writer'

/**
 * 開発用のサンプルデータ（Symfony 時代の app:seed）。APP_ENV=dev かつ DEV_LOGIN_ENABLED=1 のときだけ動く。
 * ユーザーは開発用ログインの handle（alice / bob / carol）でそのままログインできる。
 *
 *   curl -X POST http://127.0.0.1:8000/api/dev/seed
 */
export const dev = new Hono<AppEnv>()

dev.use(async (c, next) => {
  if (c.env.APP_ENV !== 'dev' || c.env.DEV_LOGIN_ENABLED !== '1') throw notFound()
  return next()
})

dev.post('/seed', async (c) => {
  const db = c.var.db
  if (await findUserByHandle(db, 'alice')) {
    return c.json({ message: '既に投入済みです（@alice が存在します）。' })
  }

  await db
    .insert(tags)
    .values(
      [
        ['PHP', 'php'],
        ['Symfony', 'symfony'],
        ['TypeScript', 'typescript'],
        ['TanStack', 'tanstack'],
        ['雑談', 'chat'],
      ].map(([name, slug]) => ({ name, slug })),
    )
    .onConflictDoNothing()

  const user = (handle: string, displayName: string, company: string | null, bio: string | null) =>
    db
      .insert(users)
      .values({
        id: newId(),
        googleSub: `dev:${handle}`,
        handle,
        displayName,
        bio,
        companyName: company,
        companySlug: company ? companySlug(company) : null,
        // 「登録から間もないアカウント」のレート制限に掛からないよう、少し前に作ったことにする
        createdAt: new Date(now().getTime() - 2 * 24 * 60 * 60 * 1000),
      })
      .returning()
      .get() as Promise<User & { handle: string }>

  const alice = await user('alice', 'Alice', '株式会社サンプル', 'バックエンドをやっています')
  const bob = await user('bob', 'Bob', 'サンプル Inc.', 'フロントエンドが好き')
  const carol = await user('carol', 'Carol', null, null)

  const ctx: WriterContext = {
    db,
    siteHost: c.env.SITE_HOST,
    waitUntil: (p) => c.executionCtx.waitUntil(p),
  }
  const post = (author: User & { handle: string }, body: string, tagSlugs: string[], parentId: string | null = null) =>
    createPost(ctx, author, { bodyMarkdown: body, tagSlugs, parentId, imageKey: null })

  const p1 = await post(alice, 'Hono の Service Binding、思ったより素直に書けた\n\n`env.API.fetch` を呼ぶだけ', ['typescript'])
  const p2 = await post(bob, 'TanStack Start のサーバー関数、例外の型が RPC 境界で落ちるのを忘れがち\n\n@alice さんの記事で見たやつ', ['tanstack', 'typescript'])
  await post(carol, '今日はもくもく会。コーヒーがおいしい ☕', ['chat'])
  await post(alice, 'cursor ページングは ULID の降順でやると楽\n\n- 時刻順に並ぶ\n- オフセットがずれない', [])
  await post(bob, 'わかる、D1 の batch でまとめて書くところだけ最初迷った', [], p1.post.id)
  await post(carol, 'ドキュメントどこ見ました？', [], p1.post.id)
  await post(alice, 'seroval で素の Error になるやつですね', [], p2.post.id)

  const react = async (target: typeof p1, by: User, emoji: string) => {
    await db.insert(reactions).values({ postId: target.post.id, userId: by.id, emoji, createdAt: now() })
    await db
      .update(posts)
      .set({ reactionCount: sql`${posts.reactionCount} + 1` })
      .where(eq(posts.id, target.post.id))
  }
  await react(p1, bob, '👍')
  await react(p1, carol, '👍')
  await react(p1, carol, '🎉')
  await react(p2, alice, '👀')
  await notifyReaction(db, p1, bob)

  const at = now()
  await db.insert(follows).values([
    { followerId: bob.id, followeeId: alice.id, lastReadAt: at, createdAt: at },
    { followerId: carol.id, followeeId: alice.id, lastReadAt: at, createdAt: at },
  ])

  return c.json({ message: 'ユーザー3人（alice / bob / carol）と投稿を投入しました。' })
})
