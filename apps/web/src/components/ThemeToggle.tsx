import { useEffect, useState } from 'react'

type Theme = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'theme'

function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'system') {
    root.removeAttribute('data-theme')
  } else {
    root.setAttribute('data-theme', theme)
  }
}

/**
 * ライト / ダーク / システム追従を切り替える。
 *
 * 初期値は __root.tsx のインラインスクリプトが既に <html> に反映しているので、
 * ここではその状態を読み取るだけにして、ちらつきを起こさない。
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system')

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    setTheme(stored === 'light' || stored === 'dark' ? stored : 'system')
  }, [])

  const cycle = () => {
    const next: Theme =
      theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system'

    setTheme(next)
    applyTheme(next)

    try {
      if (next === 'system') {
        localStorage.removeItem(STORAGE_KEY)
      } else {
        localStorage.setItem(STORAGE_KEY, next)
      }
    } catch {
      // プライベートウィンドウなどで書き込めなくても表示は壊さない
    }
  }

  const label =
    theme === 'system' ? 'システム' : theme === 'light' ? 'ライト' : 'ダーク'

  return (
    <button
      type="button"
      onClick={cycle}
      className="rounded-md border border-border px-2.5 py-1 text-xs text-text-muted transition-colors hover:border-accent hover:text-accent"
      aria-label={`表示テーマ: ${label}。クリックで切り替え`}
      title={`表示テーマ: ${label}`}
    >
      {theme === 'system' ? '◐' : theme === 'light' ? '☀' : '☾'}
      <span className="ml-1.5 hidden sm:inline">{label}</span>
    </button>
  )
}
