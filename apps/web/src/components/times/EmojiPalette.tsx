import { useState } from 'react'
import { emojiCategories, searchEmojis } from '../../lib/emoji'

type Props = {
  onPick: (emoji: string) => void
}

/**
 * 絵文字の候補パネル。検索でき、候補にない絵文字は貼り付けて Enter で使える
 * （OS の絵文字入力から貼り付けられる）。
 */
export function EmojiPalette({ onPick }: Props) {
  const [query, setQuery] = useState('')
  const hits = searchEmojis(query)

  const pick = (emoji: string) => {
    onPick(emoji)
    setQuery('')
  }

  return (
    <div className="w-72 rounded-xl border border-border bg-surface p-3 shadow-lg">
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="絵文字を検索 / 直接貼り付け"
        className="mb-3 w-full rounded-md border border-border bg-bg px-2 py-1.5 text-sm"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            const typed = query.trim()
            if (typed !== '') pick(hits?.[0]?.char ?? typed)
          }
        }}
      />

      <div className="max-h-60 overflow-y-auto">
        {hits ? (
          hits.length === 0 ? (
            <p className="px-1 py-2 text-xs text-text-muted">
              候補がありません。絵文字を直接貼り付けて Enter でも使えます。
            </p>
          ) : (
            <EmojiGrid emojis={hits} onPick={pick} />
          )
        ) : (
          emojiCategories.map((category) => (
            <div key={category.label} className="mb-3 last:mb-0">
              <p className="mb-1 px-1 text-xs font-bold text-text-muted">
                {category.label}
              </p>
              <EmojiGrid emojis={category.emojis} onPick={pick} />
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function EmojiGrid({
  emojis,
  onPick,
}: {
  emojis: Array<{ char: string; keywords: string }>
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
          className="flex h-8 w-8 items-center justify-center rounded text-xl transition-colors hover:bg-accent-soft"
        >
          {emoji.char}
        </button>
      ))}
    </div>
  )
}
