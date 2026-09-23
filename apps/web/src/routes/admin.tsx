import { Link, Outlet, createFileRoute } from '@tanstack/react-router'

/**
 * 管理画面の共通レイアウト。
 *
 * Phase 1 ではローカルからのみ起動するため認証を持たない。
 * Phase 2 でデプロイする際に Cloudflare Access を前段に置く。
 */
export const Route = createFileRoute('/admin')({
  head: () => ({
    meta: [
      { title: '管理画面' },
      // 万が一公開されても検索結果に出さない
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: AdminLayout,
})

function AdminLayout() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between border-b border-border pb-3">
        <Link to="/admin" className="text-sm font-bold">
          管理画面
        </Link>
        <Link
          to="/admin/posts/new"
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-bold text-bg"
        >
          + 新規投稿
        </Link>
      </div>

      <Outlet />
    </div>
  )
}
