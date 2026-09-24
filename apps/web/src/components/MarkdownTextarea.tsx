import { useRef } from 'react'
import type { ComponentProps } from 'react'
import {
  formatMarkdown,
  insertTable,
  pasteAsLink,
  shortcutCommand,
} from '../lib/markdownFormat'
import type { Selection, TextChange } from '../lib/markdownFormat'
import { MarkdownToolbar } from './MarkdownToolbar'

type Props = Omit<ComponentProps<'textarea'>, 'value' | 'onChange'> & {
  value: string
  onChange: (value: string) => void
  /** 表のパネルを開く向き。画面下に固定した入力欄では 'top' にする */
  popoverSide?: 'top' | 'bottom'
}

/**
 * 書式ツールバー付きの textarea（投稿用）。
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

  return (
    <div className="min-w-0 rounded-md border border-border bg-surface transition-colors focus-within:border-accent">
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
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
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
    </div>
  )
}
