import { and, eq, gt, lte } from 'drizzle-orm'
import type { Db, User } from '../db/client'
import { emailTokens } from '../db/schema'
import type { Bindings } from '../env'
import { randomToken, sha256 } from '../lib/auth'
import { now } from '../lib/http'
import { sendMail, siteUrl } from '../lib/mail'

/**
 * メールで送る1回きりのリンク（アドレスの確認・パスワードの再設定）。
 * トークンそのものは保存せず、SHA-256 だけを持つ（セッションと同じ考え方）。
 */
type Purpose = 'verify' | 'reset'

const LIFETIME_SECONDS: Record<Purpose, number> = {
  verify: 24 * 60 * 60,
  // 再設定のリンクは乗っ取りに直結するので短くする
  reset: 60 * 60,
}

async function issue(db: Db, user: User, purpose: Purpose): Promise<string> {
  // 期限切れの掃除と、同じ目的の古いリンクの無効化（最後に送ったものだけを有効にする）
  await db.batch([
    db.delete(emailTokens).where(lte(emailTokens.expiresAt, now())),
    db.delete(emailTokens).where(and(eq(emailTokens.userId, user.id), eq(emailTokens.purpose, purpose))),
  ])
  const token = randomToken()
  await db.insert(emailTokens).values({
    tokenHash: await sha256(token),
    userId: user.id,
    purpose,
    expiresAt: new Date(now().getTime() + LIFETIME_SECONDS[purpose] * 1000),
    createdAt: now(),
  })
  return token
}

/** トークンを使い切る。有効ならその持ち主の ID、無効（期限切れ・使用済み・別の目的）なら null。 */
export async function consumeEmailToken(db: Db, token: string, purpose: Purpose): Promise<string | null> {
  const row = await db
    .delete(emailTokens)
    .where(
      and(
        eq(emailTokens.tokenHash, await sha256(token)),
        eq(emailTokens.purpose, purpose),
        gt(emailTokens.expiresAt, now()),
      ),
    )
    .returning({ userId: emailTokens.userId })
    .get()
  return row?.userId ?? null
}

export async function sendVerificationMail(env: Bindings, db: Db, user: User & { email: string }) {
  const token = await issue(db, user, 'verify')
  return sendMail(env, {
    to: user.email,
    subject: '【teatimes】メールアドレスの確認',
    text: [
      'teatimes へのご登録ありがとうございます。',
      '次のリンクを開いて、メールアドレスの確認を済ませてください（24 時間有効）。',
      '',
      `${siteUrl(env)}/verify-email?token=${encodeURIComponent(token)}`,
      '',
      '確認が済むまでは、投稿・返信・リアクション・フォローができません。',
      'このメールに心当たりがない場合は、破棄してください。',
    ].join('\n'),
  })
}

export async function sendPasswordResetMail(env: Bindings, db: Db, user: User & { email: string }) {
  const token = await issue(db, user, 'reset')
  return sendMail(env, {
    to: user.email,
    subject: '【teatimes】パスワードの再設定',
    text: [
      'パスワードの再設定を受け付けました。',
      '次のリンクを開いて、新しいパスワードを設定してください（1 時間有効）。',
      '',
      `${siteUrl(env)}/reset-password?token=${encodeURIComponent(token)}`,
      '',
      '再設定すると、ログイン中のすべての端末からログアウトします。',
      '心当たりがない場合は、このメールを破棄してください（パスワードは変わりません）。',
    ].join('\n'),
  })
}
