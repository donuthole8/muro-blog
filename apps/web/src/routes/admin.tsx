import { Link, Outlet, createFileRoute, notFound } from '@tanstack/react-router'
import { meQuery } from '../lib/queries'

/**
 * 管理画面の共通レイアウト。role=admin のユーザーにだけ見せる。
 * 画面を隠すのは見た目の都合で、実際の権限チェックは API（/api/admin）が行う。
 * 管理者の任命は `php bin/console app:user:role <handle>`。
 */
export const Route = createFileRoute('/admin')({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery)
    if (me?.role !== 'admin') throw notFound()
  },
  head: () => ({
    meta: [
      { title: '管理画面' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: AdminLayout,
})

function AdminLayout() {
  const tab = 'text-sm text-text-muted transition-colors hover:text-accent'

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-4 border-b border-border pb-3">
        <span className="text-sm font-bold">管理画面</span>
        <Link
          to="/admin"
          activeOptions={{ exact: true }}
          className={tab}
          activeProps={{ className: 'text-accent' }}
        >
          投稿
        </Link>
        <Link
          to="/admin/articles"
          className={tab}
          activeProps={{ className: 'text-accent' }}
        >
          記事
        </Link>
        <Link
          to="/admin/reports"
          className={tab}
          activeProps={{ className: 'text-accent' }}
        >
          通報
        </Link>
        <Link
          to="/admin/users"
          className={tab}
          activeProps={{ className: 'text-accent' }}
        >
          ユーザー
        </Link>
        <Link
          to="/admin/tags"
          className={tab}
          activeProps={{ className: 'text-accent' }}
        >
          タグ
        </Link>
      </div>

      <Outlet />
    </div>
  )
}
