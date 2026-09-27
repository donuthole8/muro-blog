import { useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '../components/Button'
import { resetPassword } from '../lib/account'
import { meQuery } from '../lib/queries'
import { site } from '../lib/site'

/** 再設定メールのリンクの着地先。新しいパスワードを決めると、この端末でログインし直す。 */
export const Route = createFileRoute('/reset-password')({
  validateSearch: (search: Record<string, unknown>): { token?: string } =>
    typeof search.token === 'string' ? { token: search.token } : {},
  head: () => ({
    meta: [
      { title: `新しいパスワード | ${site.title}` },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: ResetPassword,
})

function ResetPassword() {
  const { token } = Route.useSearch()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [password, setPassword] = useState('')

  const submit = useMutation({
    mutationFn: () => resetPassword({ data: { token: token ?? '', password } }),
    onSuccess: async (result) => {
      if (!result.ok) return
      await queryClient.invalidateQueries({ queryKey: meQuery.queryKey })
      await navigate({ to: result.needsHandle ? '/welcome' : '/' })
    },
  })
  const failure = submit.data && !submit.data.ok ? submit.data : null

  if (!token) {
    return (
      <div className="mx-auto max-w-sm">
        <h1 className="text-xl font-bold">新しいパスワード</h1>
        <p className="mt-4 text-sm text-danger">
          リンクが正しくありません。
          <Link to="/forgot-password" className="text-accent hover:underline">
            もう一度送る
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-xl font-bold">新しいパスワード</h1>
      <form
        className="mt-6 space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          submit.mutate()
        }}
      >
        <label className="block">
          <span className="mb-1.5 block text-xs font-bold text-text-muted">
            新しいパスワード
          </span>
          <input
            type="password"
            value={password}
            autoFocus
            autoComplete="new-password"
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            maxLength={128}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
          />
          <span
            className={`mt-1 block text-xs ${failure?.errors.password ? 'text-danger' : 'text-text-muted'}`}
          >
            {failure?.errors.password ??
              '8 文字以上。変更すると、ほかの端末はすべてログアウトします。'}
          </span>
        </label>
        {failure && Object.keys(failure.errors).length === 0 && (
          <p className="text-sm text-danger">
            {failure.message}{' '}
            <Link to="/forgot-password" className="text-accent hover:underline">
              もう一度送る
            </Link>
          </p>
        )}
        <Button type="submit" disabled={submit.isPending} className="w-full">
          {submit.isPending ? '保存中…' : 'パスワードを変更してログイン'}
        </Button>
      </form>
    </div>
  )
}
