import { useMutation } from '@tanstack/react-query'
import { resendVerification } from '../lib/account'
import { useMe } from '../lib/queries'

/**
 * メールアドレスの確認が済んでいない人への案内。確認が済むまでは投稿などができない
 * （API の activeUser が 403 を返す）ので、全ページの上に出しておく。
 */
export function AccountBanner() {
  const me = useMe()
  const resend = useMutation({ mutationFn: () => resendVerification() })

  if (!me || me.emailVerified) return null

  return (
    <div className="border-b border-border bg-accent-soft px-4 py-2.5 text-xs sm:px-5">
      <p className="mx-auto max-w-3xl">
        <span className="font-bold">{me.email}</span>{' '}
        に確認メールを送りました。リンクを開くと、投稿・返信・リアクションができるようになります。{' '}
        {resend.data?.ok ? (
          <span className="text-accent">送り直しました。</span>
        ) : (
          <button
            type="button"
            disabled={resend.isPending}
            onClick={() => resend.mutate()}
            className="underline hover:text-accent disabled:opacity-50"
          >
            {resend.isPending ? '送信中…' : '確認メールを送り直す'}
          </button>
        )}
        {resend.data && !resend.data.ok && (
          <span className="ml-2 text-danger">{resend.data.message}</span>
        )}
      </p>
    </div>
  )
}
