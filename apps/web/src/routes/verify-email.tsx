import { useEffect, useRef } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { buttonClass } from '../components/Button'
import { verifyEmail } from '../lib/account'
import { meQuery } from '../lib/queries'
import { site } from '../lib/site'

/**
 * 確認メールのリンクの着地先。開いたら自動で確認する。
 * ログインしていない端末（スマホのメールアプリなど）で開いても確認は済む。
 */
export const Route = createFileRoute('/verify-email')({
  validateSearch: (search: Record<string, unknown>): { token?: string } =>
    typeof search.token === 'string' ? { token: search.token } : {},
  head: () => ({
    meta: [
      { title: `メールアドレスの確認 | ${site.title}` },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: VerifyEmail,
})

function VerifyEmail() {
  const { token } = Route.useSearch()
  const queryClient = useQueryClient()

  const verify = useMutation({
    mutationFn: (value: string) => verifyEmail({ data: { token: value } }),
    onSuccess: (result) => {
      if (result.ok)
        void queryClient.invalidateQueries({ queryKey: meQuery.queryKey })
    },
  })

  // StrictMode の二重実行でトークンを2回使わないよう、1回だけ送る
  const sent = useRef(false)
  useEffect(() => {
    if (!token || sent.current) return
    sent.current = true
    verify.mutate(token)
  }, [token, verify])

  return (
    <div className="mx-auto max-w-sm text-center">
      <h1 className="text-xl font-bold">メールアドレスの確認</h1>
      {!token ? (
        <p className="mt-4 text-sm text-danger">
          リンクが正しくありません。メールのリンクをもう一度開いてください。
        </p>
      ) : verify.data?.ok ? (
        <>
          <p className="mt-4 text-sm">
            確認できました。投稿・返信・リアクションができるようになりました。
          </p>
          <Link to="/" className={buttonClass({ className: 'mt-6' })}>
            チャンネルへ
          </Link>
        </>
      ) : verify.data ? (
        <>
          <p className="mt-4 text-sm text-danger">{verify.data.message}</p>
          <p className="mt-2 text-xs text-text-muted">
            ログインすると、画面上部の案内から確認メールを送り直せます。
          </p>
        </>
      ) : (
        <p className="mt-4 text-sm text-text-muted">確認しています…</p>
      )}
    </div>
  )
}
