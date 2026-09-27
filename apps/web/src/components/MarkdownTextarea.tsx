import { useRef, useState } from 'react'
import type { ComponentProps } from 'react'
import type { UserSummary } from '@blog/api-client'
import {
  formatMarkdown,
  insertTable,
  pasteAsLink,
  shortcutCommand,
} from '../lib/markdownFormat'
import type { Selection, TextChange } from '../lib/markdownFormat'
import { MarkdownToolbar } from './MarkdownToolbar'
import {
  MentionSuggestions,
  findMentionQuery,
  useActiveIndex,
  useMentionCandidates,
} from './MentionSuggestions'
import type { MentionQuery } from './MentionSuggestions'

type Props = Omit<ComponentProps<'textarea'>, 'value' | 'onChange'> & {
  value: string
  onChange: (value: string) => void
  /** 表のパネルを開く向き。画面下に固定した入力欄では 'top' にする */
  popoverSide?: 'top' | 'bottom'
}

/**
 * 書式ツールバー付きの textarea（投稿用）。「@」に続けて打つと、メンションの候補を出す。
 *
 * 枠線は外側の箱が持つので、className は textarea 自体の大きさや文字の指定だけ渡す。
 * onKeyDown / onPaste を渡すと、書式のショートカットや URL の貼り付けで処理しなかったときに呼ばれる。
 */
export function MarkdownTextarea({
  value,
  onChange,
  popoverSide,
  className = '',
  onKeyDown,
  onPaste,
  ...rest
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [mention, setMention] = useState<MentionQuery | null>(null)
  const candidates = useMentionCandidates(mention?.query ?? null)
  const { active, move, setActive } = useActiveIndex(candidates.length)
  const suggesting = mention !== null && candidates.length > 0

  /** カーソルが動いたら、その直前が @handle の途中かを見直す */
  const trackMention = (el: HTMLTextAreaElement) => {
    setMention(
      el.selectionStart === el.selectionEnd
        ? findMentionQuery(el.value, el.selectionStart)
        : null,
    )
  }

  const apply = (
    compute: (doc: string, sel: Selection) => TextChange | null,
  ) => {
    const el = ref.current
    if (!el) return false
    const change = compute(el.value, {
      from: el.selectionStart,
      to: el.selectionEnd,
    })
    if (!change) return false

    el.focus()
    el.setSelectionRange(change.from, change.to)
    // execCommand で書き換えると、Ctrl / ⌘ + Z で元に戻せる（value を直接差し替えると履歴が消える）
    if (!document.execCommand('insertText', false, change.insert)) {
      onChange(
        el.value.slice(0, change.from) +
          change.insert +
          el.value.slice(change.to),
      )
      requestAnimationFrame(() =>
        el.setSelectionRange(change.selection.from, change.selection.to),
      )
      return true
    }
    el.setSelectionRange(change.selection.from, change.selection.to)
    return true
  }

  const pickMention = (user: UserSummary) => {
    if (!mention) return
    const insert = `@${user.handle} `
    const end = mention.from + insert.length
    apply(() => ({
      from: mention.from,
      to: mention.to,
      insert,
      selection: { from: end, to: end },
    }))
    setMention(null)
  }

  return (
    <div className="relative min-w-0 rounded-md border border-border bg-surface transition-colors focus-within:border-accent">
      <MarkdownToolbar
        onFormat={(command) =>
          apply((doc, sel) => formatMarkdown(doc, sel, command))
        }
        onInsertTable={(cols, rows) =>
          apply((doc, sel) => insertTable(doc, sel, cols, rows))
        }
        popoverSide={popoverSide}
        className="border-b border-border"
      />
      <textarea
        {...rest}
        ref={ref}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          trackMention(e.target)
        }}
        onSelect={(e) => trackMention(e.currentTarget)}
        onBlur={() => setMention(null)}
        onKeyDown={(e) => {
          // 変換中の Enter などは候補の操作にしない
          if (suggesting && !e.nativeEvent.isComposing) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              move(e.key === 'ArrowDown' ? 1 : -1)
              return
            }
            if (
              (e.key === 'Enter' || e.key === 'Tab') &&
              !e.metaKey &&
              !e.ctrlKey
            ) {
              e.preventDefault()
              pickMention(candidates[active])
              return
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              setMention(null)
              return
            }
          }
          const command = shortcutCommand(e)
          if (command) {
            e.preventDefault()
            apply((doc, sel) => formatMarkdown(doc, sel, command))
            return
          }
          onKeyDown?.(e)
        }}
        onPaste={(e) => {
          onPaste?.(e)
          if (e.defaultPrevented) return
          const text = e.clipboardData.getData('text/plain')
          if (apply((doc, sel) => pasteAsLink(doc, sel, text))) {
            e.preventDefault()
          }
        }}
        className={`block w-full resize-none bg-transparent px-3 py-2 text-sm focus-visible:outline-none ${className}`}
      />
      {suggesting && (
        <MentionSuggestions
          users={candidates}
          active={active}
          side={popoverSide ?? 'bottom'}
          onHover={setActive}
          onPick={pickMention}
        />
      )}
    </div>
  )
}
