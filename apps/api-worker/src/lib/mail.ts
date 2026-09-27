import type { Bindings } from '../env'

/**
 * メール送信（Brevo のトランザクションメール API）。
 *
 * サイトが workers.dev で独自ドメインを持たないため、ドメインの認証なしで
 * 送信者アドレス1つだけ確認すれば送れる Brevo を使う（無料枠: 300 通/日）。
 * 独自ドメインを持ったら Resend や Cloudflare Email Service に替えてよい（この関数だけ差し替える）。
 *
 * BREVO_API_KEY が無いときは送らない。開発時は本文（リンク入り）を wrangler のログに出す。
 */
export type Mail = { to: string; subject: string; text: string }

export function isMailConfigured(env: Bindings): boolean {
  return !!env.BREVO_API_KEY && !!env.MAIL_FROM
}

/** @returns 送れたか（開発時にログへ出しただけのときも true） */
export async function sendMail(env: Bindings, mail: Mail): Promise<boolean> {
  if (!isMailConfigured(env)) {
    if (env.APP_ENV === 'dev') {
      console.log(`[mail] to=${mail.to} subject=${mail.subject}\n${mail.text}`)
      return true
    }
    console.warn('mail is not configured; dropped', mail.subject)
    return false
  }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': env.BREVO_API_KEY ?? '',
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { email: env.MAIL_FROM, name: 'teatimes' },
      to: [{ email: mail.to }],
      subject: mail.subject,
      textContent: mail.text,
    }),
  })
  if (!response.ok) {
    console.error('brevo returned', response.status, await response.text())
    return false
  }
  return true
}

export function siteUrl(env: Bindings): string {
  return (env.SITE_URL || `https://${env.SITE_HOST}`).replace(/\/+$/, '')
}
