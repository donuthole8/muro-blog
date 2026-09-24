import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { Composer } from './Composer'
import { useMe } from '../../lib/queries'
import { roomName } from '../../lib/site'

const ComposeContext = createContext<() => void>(() => undefined)

/** ヘッダーの「投稿」ボタンから開く投稿モーダル（部屋・スレッド以外の画面用）。 */
export function ComposeProvider({ children }: { children: React.ReactNode }) {
  const me = useMe()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  return (
    <ComposeContext.Provider value={() => setOpen(true)}>
      {children}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="投稿する"
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-24"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false)
          }}
        >
          <div className="w-full max-w-xl rounded-xl border border-border bg-bg p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold">
                #{me?.handle ? roomName(me.handle) : '自分の部屋'} に投稿
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="閉じる"
                className="-mr-2 flex h-9 w-9 items-center justify-center rounded-md text-text-muted transition-colors hover:text-accent"
              >
                ×
              </button>
            </div>
            <Composer autoFocus onSubmitted={() => setOpen(false)} />
          </div>
        </div>
      )}
    </ComposeContext.Provider>
  )
}

export function useOpenCompose() {
  return useContext(ComposeContext)
}

/** 部屋とスレッドの画面下部に固定する入力欄。 */
export function BottomComposer({ parentId }: { parentId?: string }) {
  const barRef = useRef<HTMLDivElement>(null)

  /*
   * 入力欄の高さは本文の行数・タグ・画像プレビューで変わる。
   * 固定値で余白を取ると、画像を添付したときに最後の投稿が入力欄の下に隠れるので、
   * 実際の高さを測って --bottom-bar-h に入れ、レイアウトの一番下（フッターより後ろ）で同じだけ空ける。
   * main の中で空けるとフッターが入力欄の下に潜り込む。
   */
  useEffect(() => {
    const el = barRef.current
    if (!el) return

    const root = document.documentElement
    const observer = new ResizeObserver(() =>
      root.style.setProperty(
        '--bottom-bar-h',
        `${el.getBoundingClientRect().height}px`,
      ),
    )
    observer.observe(el)

    return () => {
      observer.disconnect()
      root.style.removeProperty('--bottom-bar-h')
    }
  }, [])

  return (
    <>
      <div
        ref={barRef}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/95 backdrop-blur group-data-[sidebar]/layout:lg:left-60"
      >
        {/* pb-safe は iPhone のホームバーぶんを空ける（styles.css） */}
        <div className="pb-safe mx-auto max-w-3xl px-4 pt-3 sm:px-5">
          <Composer parentId={parentId} />
        </div>
      </div>
    </>
  )
}
