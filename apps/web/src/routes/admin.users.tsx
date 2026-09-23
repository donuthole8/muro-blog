import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '../components/Button'
import { listUsers, setUserSuspended } from '../lib/admin'
import { formatFullTime } from '../lib/format'

/** ユーザーの停止。停止すると全端末からログアウトし、投稿は一覧から消える。 */
export const Route = createFileRoute('/admin/users')({
  component: AdminUsers,
})

function AdminUsers() {
  const queryClient = useQueryClient()
  const [q, setQ] = useState('')
  const [submitted, setSubmitted] = useState('')

  const users = useQuery({
    queryKey: ['admin', 'users', submitted],
    queryFn: () => listUsers({ data: { q: submitted || undefined } }),
    staleTime: 0,
  })

  const toggle = useMutation({
    mutationFn: (input: { id: string; suspended: boolean }) =>
      setUserSuspended({ data: input }),
    onSuccess: (result) => {
      if (!result.ok) alert(result.message)
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
  })

  return (
    <div>
      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          setSubmitted(q)
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="handle か表示名で検索"
          className="flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
        />
        <Button type="submit" variant="ghost">
          検索
        </Button>
      </form>

      <div className="divide-y divide-border">
        {users.data?.map((user) => {
          const suspended = user.suspendedAt != null
          return (
            <div
              key={user.id}
              className="flex flex-wrap items-center gap-3 py-2.5 text-sm"
            >
              <span className="font-bold">{user.displayName}</span>
              {user.handle ? (
                <Link
                  to="/admin"
                  search={{ handle: user.handle }}
                  className="text-xs text-text-muted hover:text-accent"
                >
                  @{user.handle}
                </Link>
              ) : (
                <span className="text-xs text-text-muted">
                  （handle 未設定）
                </span>
              )}
              {user.role === 'admin' && (
                <span className="text-xs text-accent">管理者</span>
              )}
              {suspended && <span className="text-xs text-danger">停止中</span>}
              <span className="text-xs text-text-muted">
                登録 {formatFullTime(user.createdAt)}
              </span>

              {user.role !== 'admin' && (
                <button
                  type="button"
                  disabled={toggle.isPending}
                  onClick={() => {
                    if (
                      suspended ||
                      confirm(
                        `@${user.handle ?? user.displayName} を停止します。よろしいですか？`,
                      )
                    ) {
                      toggle.mutate({ id: user.id, suspended: !suspended })
                    }
                  }}
                  className="ml-auto inline-flex min-h-8 items-center rounded-md border border-border px-2 text-xs text-text-muted transition-colors hover:border-danger hover:text-danger disabled:opacity-40"
                >
                  {suspended ? '停止を解除' : '停止する'}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
