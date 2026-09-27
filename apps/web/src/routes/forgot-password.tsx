import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { Button } from '../components/Button'
import { requestPasswordReset } from '../lib/account'
import { site } from '../lib/site'

/** パスワードの再設定メールを送る。登録済みかどうかは画面からも分からないようにする。 */
export const Route = createFileRoute('/forgot-password')({
  head: () => ({
    meta: [
      { title: `パスワードの再設定 | ${site.title}` },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: ForgotPassword,
})

function ForgotPassword() {
  const [email, setEmail] = useState('')
  const submit = useMutation({
    mutationFn: () => requestPasswordReset({ data: { email } }),
  })
  const failure = submit.data && !submit.data.ok ? submit.data : null

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-xl font-bold">パスワードの再設定</h1>

      {submit.data?.ok ? (
        <p className="mt-6 text-sm">
          <span className="font-bold">{email}</span>{' '}
          が登録済みであれば、再設定のリンクを送りました（1
          時間有効）。届かないときは迷惑メールのフォルダも確認してください。
        </p>
      ) : (
        <form
          className="mt-6 space-y-5"
          onSubmit={(e) => {
            e.preventDefault()
            submit.mutate()
          }}
        >
          <p className="text-sm text-text-muted">
            登録したメールアドレスに、新しいパスワードを決めるためのリンクを送ります。
          </p>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-text-muted">
              メールアドレス
            </span>
            <input
              type="email"
              value={email}
              autoFocus
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
              required
              maxLength={254}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
            />
          </label>
          {failure && (
            <p className="text-sm text-danger">
              {Object.values(failure.errors)[0] ?? failure.message}
            </p>
          )}
          <Button type="submit" disabled={submit.isPending} className="w-full">
            {submit.isPending ? '送信中…' : 'リンクを送る'}
          </Button>
        </form>
      )}

      <p className="mt-6 text-center text-sm">
        <Link to="/login" className="text-accent hover:underline">
          ログインに戻る
        </Link>
      </p>
    </div>
  )
}
