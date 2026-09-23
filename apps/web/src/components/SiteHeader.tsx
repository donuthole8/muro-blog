import { Link, useRouter } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Button, buttonClass } from './Button'
import { ThemeToggle } from './ThemeToggle'
import { Avatar } from './times/Avatar'
import { useOpenCompose } from './times/ComposeModal'
import { Popover } from './times/Popover'
import { logout } from '../lib/account'
import { meQuery, useMe } from '../lib/queries'
import { loginUrl, site } from '../lib/site'

export function SiteHeader() {
  const me = useMe()
  const openCompose = useOpenCompose()

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/95 backdrop-blur">
      {/* 狭い画面ではナビが2段目に回るぶん、上下の余白を詰めて高さを抑える */}
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2 sm:py-3">
        <Link
          to="/"
          className="font-mono text-lg font-bold text-text transition-colors hover:text-accent"
        >
          {site.title}
        </Link>

        {/* 狭い画面ではナビを2段目に回し、右側のボタン群と取り合わないようにする */}
        <nav className="order-last flex w-full gap-4 text-sm whitespace-nowrap sm:order-none sm:w-auto sm:flex-1">
          <NavLink to="/">ロビー</NavLink>
          <NavLink to="/tags">タグ</NavLink>
          <NavLink to="/search">検索</NavLink>
          {me?.handle && <NavLink to="/following">フォロー中</NavLink>}
        </nav>

        <div className="ml-auto flex items-center gap-4 sm:ml-0">
          {me?.handle && (
            <>
              <Button size="sm" onClick={openCompose}>
                書く
              </Button>
              <Link
                to="/notifications"
                aria-label={`通知${me.unreadNotificationCount > 0 ? `（未読 ${me.unreadNotificationCount} 件）` : ''}`}
                className="relative flex h-9 w-9 items-center justify-center rounded-md text-lg text-text-muted transition-colors hover:text-accent"
              >
                🔔
                {me.unreadNotificationCount > 0 && (
                  <span className="absolute top-0 right-0 min-w-4 rounded-full bg-danger px-1 text-center text-[0.6rem] leading-4 font-bold text-bg">
                    {me.unreadNotificationCount > 99
                      ? '99+'
                      : me.unreadNotificationCount}
                  </span>
                )}
              </Link>
            </>
          )}

          {me ? <AccountMenu /> : <LoginLink />}
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}

function NavLink({
  to,
  children,
}: {
  to: '/' | '/tags' | '/search' | '/following'
  children: React.ReactNode
}) {
  return (
    <Link
      to={to}
      className="text-text-muted transition-colors hover:text-accent"
      activeProps={{ className: 'text-accent' }}
      activeOptions={{ exact: to === '/' }}
    >
      {children}
    </Link>
  )
}

function LoginLink() {
  return (
    <a
      href={loginUrl()}
      className={buttonClass({ variant: 'ghost', size: 'sm' })}
    >
      ログイン
    </a>
  )
}

function AccountMenu() {
  const me = useMe()
  const router = useRouter()
  const queryClient = useQueryClient()

  if (!me) return null

  const signOut = async () => {
    await logout()
    queryClient.setQueryData(meQuery.queryKey, null)
    queryClient.removeQueries({ queryKey: ['viewer'] })
    queryClient.removeQueries({ queryKey: ['following'] })
    queryClient.removeQueries({ queryKey: ['notifications'] })
    await router.navigate({ to: '/' })
  }

  const itemClass =
    'block w-full px-4 py-2 text-left text-sm transition-colors hover:bg-accent-soft'

  return (
    <Popover
      align="right"
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-label="アカウントメニュー"
          className="flex h-9 w-9 items-center justify-center rounded-full"
        >
          <Avatar user={me} size="sm" />
        </button>
      )}
    >
      {(close) => (
        <div
          className="w-48 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-lg"
          onClick={close}
        >
          {me.handle ? (
            <Link
              to="/@{$handle}"
              params={{ handle: me.handle }}
              className={itemClass}
            >
              自分の部屋
            </Link>
          ) : (
            <Link to="/welcome" className={itemClass}>
              handle を決める
            </Link>
          )}
          <Link to="/settings" className={itemClass}>
            設定
          </Link>
          {me.role === 'admin' && (
            <Link to="/admin" className={itemClass}>
              管理画面
            </Link>
          )}
          <button type="button" onClick={signOut} className={itemClass}>
            ログアウト
          </button>
        </div>
      )}
    </Popover>
  )
}
