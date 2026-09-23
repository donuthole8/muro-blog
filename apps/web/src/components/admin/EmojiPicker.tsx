import { useEffect, useRef, useState } from 'react'
import {
  DEFAULT_EMOJI,
  emojiCategories,
  randomEmoji,
  searchEmojis,
} from '../../lib/emoji'

type Props = {
  value: string | null
  onChange: (emoji: string) => void
}

/**
 * 記事のアイキャッチ絵文字を選ぶ。
 *
 * 大きなタイルを押すと候補パネルが開く。候補にないものを使いたいときのために
 * 直接入力も受け付ける（OS の絵文字入力から貼り付けられる）。
 */
export function EmojiPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  // パネルの外を押したら閉じる
  useEffect(() => {
    if (!open) return

    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const pick = (emoji: string) => {
    onChange(emoji)
    setOpen(false)
    setQuery('')
  }

  const hits = searchEmojis(query)

  return (
    <div ref={containerRef} className="relative inline-block">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="絵文字を選ぶ"
          className="flex h-20 w-20 items-center justify-center rounded-lg border border-border bg-surface text-4xl transition-colors hover:border-accent"
        >
          {value || DEFAULT_EMOJI}
        </button>

        <button
          type="button"
          onClick={() => onChange(randomEmoji())}
          className="rounded-md border border-border px-2 py-1 text-xs text-text-muted transition-colors hover:border-accent hover:text-accent"
        >
          ランダム
        </button>
      </div>

      {open && (
        <div className="absolute z-20 mt-2 w-80 rounded-lg border border-border bg-surface p-3 shadow-lg">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="絵文字を検索 / 直接貼り付け"
            className="mb-3 w-full rounded-md border border-border bg-bg px-2 py-1.5 text-sm"
            onKeyDown={(e) => {
              // 候補にない絵文字を貼り付けて Enter でそのまま採用する
              if (e.key === 'Enter') {
                e.preventDefault()
                const typed = query.trim()
                if (typed !== '') pick(hits?.[0]?.char ?? typed)
              }
            }}
          />

          <div className="max-h-64 overflow-y-auto">
            {hits ? (
              hits.length === 0 ? (
                <p className="px-1 py-2 text-xs text-text-muted">
                  候補がありません。絵文字を直接貼り付けて Enter
                  でも設定できます。
                </p>
              ) : (
                <EmojiGrid emojis={hits} selected={value} onPick={pick} />
              )
            ) : (
              emojiCategories.map((category) => (
                <div key={category.label} className="mb-3 last:mb-0">
                  <p className="mb-1 px-1 text-[0.65rem] font-bold text-text-muted">
                    {category.label}
                  </p>
                  <EmojiGrid
                    emojis={category.emojis}
                    selected={value}
                    onPick={pick}
                  />
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function EmojiGrid({
  emojis,
  selected,
  onPick,
}: {
  emojis: Array<{ char: string; keywords: string }>
  selected: string | null
  onPick: (emoji: string) => void
}) {
  return (
    <div className="grid grid-cols-8 gap-0.5">
      {emojis.map((emoji) => (
        <button
          key={emoji.char}
          type="button"
          title={emoji.keywords}
          onClick={() => onPick(emoji.char)}
          className={
            'flex h-8 w-8 items-center justify-center rounded text-xl transition-colors hover:bg-accent-soft' +
            (selected === emoji.char ? ' bg-accent-soft' : '')
          }
        >
          {emoji.char}
        </button>
      ))}
    </div>
  )
}
