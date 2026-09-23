import { useState } from 'react'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, buttonClass } from '../components/Button'
import { emailAuth } from '../lib/account'
import { meQuery } from '../lib/queries'
import { googleLoginUrl, safeReturnTo, site } from '../lib/site'

type Mode = 'login' | 'register'

/**
 * ログイン・新規登録。メールアドレス + パスワードか、Google を選ぶ。
 * メールの確認や 2 段階認証はない（API 側の routes/auth.ts 参照）。
 */
export const Route = createFileRoute('/login')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { returnTo?: string; mode?: Mode } => ({
    ...(typeof search.returnTo === 'string'
      ? { returnTo: search.returnTo }
      : {}),
    ...(search.mode === 'register' ? { mode: 'register' as const } : {}),
  }),
  beforeLoad: async ({ context, search }) => {
    const me = await context.queryClient.ensureQueryData(meQuery)
    if (me) throw redirect({ href: safeReturnTo(search.returnTo) })
  },
  head: () => ({
    meta: [
      { title: `ログイン | ${site.title}` },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: Login,
})

function Login() {
  const search = Route.useSearch()
  const returnTo = safeReturnTo(search.returnTo)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<Mode>(search.mode ?? 'login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const submit = useMutation({
    mutationFn: () => emailAuth({ data: { mode, email, password } }),
    onSuccess: async (result) => {
      if (!result.ok) return
      await queryClient.invalidateQueries({ queryKey: meQuery.queryKey })
      if (result.needsHandle) await navigate({ to: '/welcome' })
      else await navigate({ href: returnTo })
    },
  })
  const failure = submit.data && !submit.data.ok ? submit.data : null
  const isRegister = mode === 'register'

  const switchMode = (next: Mode) => {
    setMode(next)
    submit.reset()
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-xl font-bold">
        {isRegister ? 'アカウントをつくる' : 'ログイン'}
      </h1>

      <form
        className="mt-6 space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          submit.mutate()
        }}
      >
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
          {failure?.errors.email && (
            <span className="mt-1 block text-xs text-danger">
              {failure.errors.email}
            </span>
          )}
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-bold text-text-muted">
            パスワード
          </span>
          <input
            type="password"
            value={password}
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={isRegister ? 8 : undefined}
            maxLength={128}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
          />
          <span
            className={`mt-1 block text-xs ${failure?.errors.password ? 'text-danger' : 'text-text-muted'}`}
          >
            {failure?.errors.password ?? (isRegister ? '8 文字以上' : '')}
          </span>
        </label>

        {failure && Object.keys(failure.errors).length === 0 && (
          <p className="text-sm text-danger">{failure.message}</p>
        )}

        <Button type="submit" disabled={submit.isPending} className="w-full">
          {submit.isPending ? '送信中…' : isRegister ? '登録する' : 'ログイン'}
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-text-muted">
        {isRegister ? 'アカウントをお持ちの方は' : 'はじめての方は'}
        <button
          type="button"
          onClick={() => switchMode(isRegister ? 'login' : 'register')}
          className="text-accent hover:underline"
        >
          {isRegister ? 'ログイン' : '新規登録'}
        </button>
      </p>

      <div className="my-6 flex items-center gap-3 text-xs text-text-muted">
        <span className="h-px flex-1 bg-border" />
        または
        <span className="h-px flex-1 bg-border" />
      </div>

      <a
        href={googleLoginUrl(returnTo === '/' ? undefined : returnTo)}
        className={buttonClass({ variant: 'ghost', className: 'w-full' })}
      >
        Google で{isRegister ? '登録' : 'ログイン'}
      </a>
    </div>
  )
}
