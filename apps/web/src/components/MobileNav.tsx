import { useEffect, useRef } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { buttonClass } from './Button'
import { Icon } from './Icon'
import { ChannelNav } from './Sidebar'
import { ThemeToggle } from './ThemeToggle'
import { useMe } from '../lib/queries'
import { loginUrl, site } from '../lib/site'

/**
 * 狭い画面で左から出すメニュー。ヘッダーに入りきらないナビと、
 * サイドバー（lg 以上でだけ出る）のチャンネル一覧をここにまとめる。
 *
 * 閉じている間も DOM に残してスライドのアニメーションを効かせ、inert で操作と読み上げから外す。
 */
export function MobileNav({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const me = useMe()
  const panelRef = useRef<HTMLDivElement>(null)
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  // 画面を移ったら閉じる
  useEffect(() => {
    onClose()
  }, [pathname])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)

    // 開いている間は後ろのページをスクロールさせない
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // キーボード操作の人がすぐメニューを辿れるよう、閉じるボタンにフォーカスを移す
    panelRef.current?.querySelector<HTMLElement>('button')?.focus()

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
    }
  }, [open, onClose])

  const linkClass =
    'flex min-h-10 items-center rounded-md px-2 text-text-muted transition-colors hover:bg-accent-soft hover:text-text'
  const activeProps = { className: 'bg-accent-soft !text-accent font-bold' }

  return (
    <div
      className={`fixed inset-0 z-50 lg:hidden ${open ? '' : 'pointer-events-none'}`}
      inert={!open}
    >
      <div
        aria-hidden
        onClick={onClose}
        className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`}
      />

      <div
        ref={panelRef}
        id="mobile-nav"
        role="dialog"
        aria-modal="true"
        aria-label="メニュー"
        // 同じページへのリンクを押したときは pathname が変わらないので、ここで閉じる
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('a')) onClose()
        }}
        className={`absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-border bg-bg shadow-xl transition-transform duration-200 ease-out motion-reduce:transition-none ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
          <span className="flex items-center gap-1.5 font-mono text-lg font-bold">
            <Icon name="cup" className="h-5 w-5 text-accent" />
            {site.title}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="メニューを閉じる"
            className="flex h-10 w-10 items-center justify-center rounded-md text-text-muted transition-colors hover:text-accent"
          >
            <Icon name="x" className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto overscroll-contain px-3 py-4 text-sm">
          <ChannelNav />

          <nav aria-label="メイン" className="space-y-0.5">
            {/* ログイン中は下のチャンネル一覧の先頭に同じリンクがある */}
            {!me?.handle && (
              <Link
                to="/"
                className={linkClass}
                activeProps={activeProps}
                activeOptions={{ exact: true }}
              >
                チャンネル
              </Link>
            )}
            <Link to="/tags" className={linkClass} activeProps={activeProps}>
              タグ
            </Link>
            <Link to="/search" className={linkClass} activeProps={activeProps}>
              検索
            </Link>
            {me?.handle && (
              <>
                <Link
                  to="/following"
                  className={linkClass}
                  activeProps={activeProps}
                >
                  フォロー中
                </Link>
                <Link
                  to="/notifications"
                  className={linkClass}
                  activeProps={activeProps}
                >
                  通知
                  {me.unreadNotificationCount > 0 && (
                    <span className="ml-auto rounded-full bg-danger px-1.5 text-[0.7rem] leading-4 font-bold text-bg">
                      {me.unreadNotificationCount > 99
                        ? '99+'
                        : me.unreadNotificationCount}
                    </span>
                  )}
                </Link>
              </>
            )}
          </nav>

          {!me && (
            <a
              href={loginUrl()}
              className={buttonClass({ className: 'w-full justify-center' })}
            >
              ログイン
            </a>
          )}
        </div>

        <div className="pb-safe flex shrink-0 items-center justify-between border-t border-border px-4 pt-3">
          <span className="text-xs text-text-muted">表示テーマ</span>
          <ThemeToggle />
        </div>
      </div>
    </div>
  )
}
