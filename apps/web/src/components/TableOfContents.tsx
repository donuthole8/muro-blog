import { useEffect, useState } from 'react'
import type { TocItem } from '../lib/toc'

/**
 * 記事本文の見出しから目次を作る。
 *
 * 読んでいる位置に応じたハイライト（スクロールスパイ）は
 * IntersectionObserver で行うため、ハイドレーション後にだけ効く。
 */
export function TableOfContents({ items }: { items: Array<TocItem> }) {
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    const headings = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null)

    if (headings.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
            break
          }
        }
      },
      // 画面上部寄り・下70%を無視することで「今読んでいる見出し」に絞る
      { rootMargin: '-80px 0px -70% 0px' },
    )

    headings.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [items])

  if (items.length === 0) return null

  const minLevel = Math.min(...items.map((item) => item.level))

  return (
    <details
      open
      className="mt-6 mb-8 rounded-xl border border-border bg-surface px-4 py-3"
    >
      <summary className="cursor-pointer text-sm font-bold text-text-muted select-none">
        目次
      </summary>
      <nav aria-label="目次" className="mt-3">
        <ul className="space-y-1.5 text-sm">
          {items.map((item) => (
            <li
              key={item.id}
              style={{ paddingLeft: `${(item.level - minLevel) * 1}rem` }}
            >
              <a
                href={`#${item.id}`}
                className={
                  activeId === item.id
                    ? 'font-bold text-accent'
                    : 'text-text-muted transition-colors hover:text-accent'
                }
              >
                {item.text}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </details>
  )
}
