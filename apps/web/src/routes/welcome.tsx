import { useState } from 'react'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '../components/Button'
import { updateMe } from '../lib/account'
import { meQuery } from '../lib/queries'
import { loginUrl, site } from '../lib/site'

/** 初回ログイン直後の handle 決定画面。handle は部屋の URL（/@handle）になり、後から変えられない。 */
export const Route = createFileRoute('/welcome')({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery)
    if (!me) throw redirect({ href: loginUrl(), reloadDocument: true })
    if (me.handle)
      throw redirect({ to: '/@{$handle}', params: { handle: me.handle } })

    return { me }
  },
  head: () => ({
    meta: [
      { title: `はじめに | ${site.title}` },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: Welcome,
})

function Welcome() {
  const { me } = Route.useRouteContext()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [handle, setHandle] = useState('')
  const [displayName, setDisplayName] = useState(me.displayName)
  const [agreed, setAgreed] = useState(false)

  const save = useMutation({
    mutationFn: () =>
      updateMe({
        data: { handle, displayName, bio: null, companyName: null },
      }),
    onSuccess: async (result) => {
      if (!result.ok) return
      queryClient.setQueryData(meQuery.queryKey, result.me)
      await navigate({
        to: '/@{$handle}',
        params: { handle: result.me.handle ?? handle },
      })
    },
  })
  const failure = save.data && !save.data.ok ? save.data : null

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-xl font-bold">ようこそ 👋</h1>
      <p className="mt-2 text-sm text-text-muted">
        あなたの部屋の URL になる handle を決めてください。
        <strong>あとから変更できません。</strong>
      </p>

      <form
        className="mt-6 space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <label className="block">
          <span className="mb-1.5 block text-xs font-bold text-text-muted">
            handle
          </span>
          <div className="flex items-center rounded-md border border-border bg-surface px-3 focus-within:border-accent">
            <span className="text-sm text-text-muted">
              {site.url.replace(/^https?:\/\//, '')}/@
            </span>
            <input
              value={handle}
              autoFocus
              onChange={(e) => setHandle(e.target.value.toLowerCase())}
              placeholder="your_name"
              pattern="[a-z0-9_]{3,20}"
              required
              className="min-w-0 flex-1 bg-transparent py-2 font-mono text-sm outline-none"
            />
          </div>
          <span
            className={`mt-1 block text-xs ${failure?.errors.handle ? 'text-danger' : 'text-text-muted'}`}
          >
            {failure?.errors.handle ??
              '英小文字・数字・アンダースコア（_）の 3〜20 文字'}
          </span>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-bold text-text-muted">
            表示名
          </span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            maxLength={50}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
          />
          {failure?.errors.displayName && (
            <span className="mt-1 block text-xs text-danger">
              {failure.errors.displayName}
            </span>
          )}
        </label>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-1"
          />
          <span>
            <a
              href="/terms"
              target="_blank"
              className="text-accent hover:underline"
            >
              利用規約
            </a>
            と
            <a
              href="/privacy"
              target="_blank"
              className="text-accent hover:underline"
            >
              プライバシーポリシー
            </a>
            に同意します
          </span>
        </label>

        {failure && Object.keys(failure.errors).length === 0 && (
          <p className="text-sm text-danger">{failure.message}</p>
        )}

        <Button
          type="submit"
          disabled={!agreed || save.isPending}
          className="w-full"
        >
          {save.isPending ? '作成中…' : '部屋をつくる'}
        </Button>
      </form>
    </div>
  )
}
