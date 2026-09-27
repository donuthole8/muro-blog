import { useEffect, useState } from 'react'
import { useRouterState } from '@tanstack/react-router'

/** これより早く終わる遷移では出さない（キャッシュ済みの画面でちらつかせない） */
const SHOW_AFTER_MS = 150

/**
 * 画面遷移中（次の画面の loader がデータを取っている間）に、画面最上部へ細い帯を流す。
 * loader が API の応答を待つあいだは前の画面のままなので、押したことが伝わるようにする。
 */
export function NavigationProgress() {
  const loading = useRouterState({ select: (s) => s.status === 'pending' })
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!loading) {
      setVisible(false)
      return
    }
    const timer = setTimeout(() => setVisible(true), SHOW_AFTER_MS)
    return () => clearTimeout(timer)
  }, [loading])

  return (
    <div
      role="progressbar"
      aria-label="読み込み中"
      aria-hidden={!visible}
      className={`pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
    >
      <style>{`
        @keyframes nav-progress {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(250%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .nav-progress-bar { animation: none !important; transform: none !important; width: 100% !important; opacity: .6; }
        }
      `}</style>
      {visible && (
        <div
          className="nav-progress-bar h-full w-2/5 rounded-full bg-accent"
          style={{ animation: 'nav-progress 1s ease-in-out infinite' }}
        />
      )}
    </div>
  )
}
