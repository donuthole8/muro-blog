import { useState } from 'react'
import { createFileRoute, notFound, useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '../components/Button'
import { devLogin } from '../lib/account'
import { meQuery } from '../lib/queries'

/**
 * 開発用ログイン。Google OAuth を設定していないローカル環境で、任意の handle として
 * ログインして動作確認するための画面。本番ビルドでは 404。
 * API 側も APP_ENV=dev かつ DEV_LOGIN_ENABLED=1 でなければ受け付けない。
 */
export const Route = createFileRoute('/dev-login')({
  validateSearch: (search: Record<string, unknown>): { returnTo?: string } =>
    typeof search.returnTo === 'string' ? { returnTo: search.returnTo } : {},
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound()
  },
  head: () => ({
    meta: [{ title: '開発用ログイン' }, { name: 'robots', content: 'noindex' }],
  }),
  component: DevLogin,
})

function DevLogin() {
  const { returnTo } = Route.useSearch()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [handle, setHandle] = useState('alice')

  const login = useMutation({
    mutationFn: () => devLogin({ data: { handle } }),
    onSuccess: async (result) => {
      if (!result.ok) return
      await queryClient.invalidateQueries({ queryKey: meQuery.queryKey })
      await navigate({ href: returnTo?.startsWith('/') ? returnTo : '/' })
    },
  })

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-lg font-bold">開発用ログイン</h1>
      <p className="mt-1 text-xs text-text-muted">
        Google OAuth が未設定のため、handle
        を指定してログインします（存在しなければ作成）。 `php bin/console
        app:seed` で alice / bob / carol が作られます。
      </p>
      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          login.mutate()
        }}
      >
        <input
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          className="flex-1 rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm"
        />
        <Button type="submit" disabled={login.isPending}>
          ログイン
        </Button>
      </form>
      {login.data && !login.data.ok && (
        <p className="mt-2 text-xs text-danger">{login.data.message}</p>
      )}
    </div>
  )
}
