import { useCallback, useState } from 'react'
import { Link, useRouter } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Button, buttonClass } from './Button'
import { Icon } from './Icon'
import { MobileNav } from './MobileNav'
import { ThemeToggle } from './ThemeToggle'
import { Avatar } from './times/Avatar'
import { useOpenCompose } from './times/ComposeModal'
import { Popover } from './times/Popover'
import { logout } from '../lib/account'
import { meQuery, useMe } from '../lib/queries'
import { loginUrl, roomName, site } from '../lib/site'

export function SiteHeader() {
  const me = useMe()
  const openCompose = useOpenCompose()
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = useCallback(() => setMenuOpen(false), [])

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-bg/95 backdrop-blur">
        {/* 高さは h-14 で固定する。サイドバーや部屋の見出しの sticky の top がこの高さに合わせてある */}
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-2 sm:gap-4 sm:px-5 lg:group-data-[sidebar]/layout:max-w-none">
          {/* サイドバーが出ない幅では、ナビとチャンネル一覧をメニューにしまう */}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="メニューを開く"
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:text-accent lg:hidden"
          >
            <Icon name="menu" className="h-5 w-5" />
          </button>

          <Link
            to="/"
            className="flex min-w-0 items-center gap-1.5 font-mono text-lg font-bold text-text transition-colors hover:text-accent"
          >
            <Icon name="cup" className="h-5 w-5 text-accent" />
            <span className="truncate">{site.title}</span>
          </Link>

          {/* ハンバーガーと同じリンクが2か所に並ばないよう、ナビはハンバーガーが消える lg から出す */}
          <nav className="hidden flex-1 gap-4 text-sm whitespace-nowrap lg:flex">
            <NavLink to="/">チャンネル</NavLink>
            <NavLink to="/tags">タグ</NavLink>
            <NavLink to="/search">検索</NavLink>
            {me?.handle && <NavLink to="/following">フォロー中</NavLink>}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-3 lg:ml-0">
            {me?.handle && (
              <>
                <Button
                  size="sm"
                  onClick={() => openCompose()}
                  aria-label="投稿する"
                >
                  <Icon name="pencil" className="h-4 w-4 sm:hidden" />
                  <span className="hidden sm:inline">投稿</span>
                </Button>
                <Link
                  to="/notifications"
                  aria-label={`通知${me.unreadNotificationCount > 0 ? `（未読 ${me.unreadNotificationCount} 件）` : ''}`}
                  className="relative flex h-10 w-10 items-center justify-center rounded-md text-text-muted transition-colors hover:text-accent"
                >
                  <Icon name="bell" className="h-5 w-5" />
                  {me.unreadNotificationCount > 0 && (
                    <span className="absolute top-0.5 right-0.5 min-w-4 rounded-full bg-danger px-1 text-center text-[0.7rem] leading-4 font-bold text-bg">
                      {me.unreadNotificationCount > 99
                        ? '99+'
                        : me.unreadNotificationCount}
                    </span>
                  )}
                </Link>
              </>
            )}

            {me ? <AccountMenu /> : <LoginLink />}
            {/* 狭い画面ではメニューの中に置く */}
            <div className="hidden lg:block">
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      {/*
      header の外に置く。backdrop-blur（backdrop-filter）は fixed の子の基準になってしまい、
      中に置くとメニューがヘッダーの高さに切り取られる。
    */}
      <MobileNav open={menuOpen} onClose={closeMenu} />
    </>
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
      // 色だけだと今いる場所が弱いので、下線も引く
      activeProps={{
        className: 'text-accent underline decoration-2 underline-offset-8',
      }}
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
          className="flex h-10 w-10 items-center justify-center rounded-full"
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
              #{roomName(me.handle)}
            </Link>
          ) : (
            <Link to="/welcome" className={itemClass}>
              handle を決める
            </Link>
          )}
          {me.handle && (
            <Link to="/articles" className={itemClass}>
              自分の記事
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
