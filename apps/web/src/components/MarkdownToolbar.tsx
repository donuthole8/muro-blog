import { useState } from 'react'
import type { FormatCommand } from '../lib/markdownFormat'
import { Icon } from './Icon'
import type { IconName } from './Icon'
import { Popover } from './times/Popover'

type Props = {
  onFormat: (command: FormatCommand) => void
  onInsertTable: (cols: number, rows: number) => void
  /** 見出し・区切り線のボタンを出す（記事だけ。投稿は短文なので出さない） */
  blocks?: boolean
  /** 表のパネルを開く向き。画面下に固定した入力欄では 'top' にする */
  popoverSide?: 'top' | 'bottom'
  className?: string
}

type Item = {
  command: FormatCommand
  icon: IconName
  label: string
  shortcut?: string
  blockOnly?: boolean
}

const groups: Array<Array<Item>> = [
  [
    { command: 'heading', icon: 'heading', label: '見出し', blockOnly: true },
    { command: 'bold', icon: 'bold', label: '太字', shortcut: 'B' },
    { command: 'italic', icon: 'italic', label: '斜体', shortcut: 'I' },
    {
      command: 'strike',
      icon: 'strikethrough',
      label: '取り消し線',
      shortcut: 'Shift + X',
    },
    { command: 'link', icon: 'link', label: 'リンク', shortcut: 'K' },
  ],
  [
    { command: 'bulletList', icon: 'list', label: '箇条書き' },
    { command: 'orderedList', icon: 'listOrdered', label: '番号付きリスト' },
    { command: 'quote', icon: 'quote', label: '引用' },
  ],
  [
    { command: 'code', icon: 'code', label: 'コード' },
    { command: 'codeBlock', icon: 'codeBlock', label: 'コードブロック' },
    { command: 'hr', icon: 'minus', label: '区切り線', blockOnly: true },
  ],
]

const buttonClass =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-accent-soft hover:text-accent'

/**
 * Markdown の記法をボタンで差し込むツールバー（Slack の書式ボタンと同じ役割）。
 *
 * ボタンを押してもエディタのフォーカスと選択範囲が外れないよう、
 * mousedown の既定の動作（フォーカスの移動）を止めている。
 */
export function MarkdownToolbar({
  onFormat,
  onInsertTable,
  blocks = false,
  popoverSide = 'bottom',
  className = '',
}: Props) {
  return (
    <div
      role="toolbar"
      aria-label="書式"
      className={`flex items-center gap-0.5 overflow-x-auto px-1 py-0.5 ${className}`}
    >
      {groups.map((items, i) => (
        <div key={i} className="flex shrink-0 items-center gap-0.5">
          {i > 0 && <span aria-hidden className="mx-1 h-4 w-px bg-border" />}
          {items
            .filter((item) => blocks || !item.blockOnly)
            .map((item) => {
              const title = item.shortcut
                ? `${item.label}（Ctrl / ⌘ + ${item.shortcut}）`
                : item.label
              return (
                <button
                  key={item.command}
                  type="button"
                  title={title}
                  aria-label={item.label}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onFormat(item.command)}
                  className={buttonClass}
                >
                  <Icon name={item.icon} className="h-4 w-4" />
                </button>
              )
            })}
        </div>
      ))}
      <TablePicker side={popoverSide} onPick={onInsertTable} />
    </div>
  )
}

const MAX_COLS = 6
const MAX_ROWS = 5

/** マス目をなぞって列数・行数を選び、表のひな形を差し込む。 */
function TablePicker({
  side,
  onPick,
}: {
  side: 'top' | 'bottom'
  onPick: (cols: number, rows: number) => void
}) {
  const [size, setSize] = useState({ cols: 3, rows: 2 })

  return (
    <Popover
      side={side}
      trigger={({ toggle }) => (
        <button
          type="button"
          title="表"
          aria-label="表を挿入"
          onMouseDown={(e) => e.preventDefault()}
          onClick={toggle}
          className={buttonClass}
        >
          <Icon name="table" className="h-4 w-4" />
        </button>
      )}
    >
      {(close) => (
        <div className="rounded-xl border border-border bg-surface p-3 shadow-lg">
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: `repeat(${MAX_COLS}, 1.25rem)` }}
          >
            {Array.from({ length: MAX_ROWS * MAX_COLS }, (_, i) => {
              const cols = (i % MAX_COLS) + 1
              const rows = Math.floor(i / MAX_COLS) + 1
              const active = cols <= size.cols && rows <= size.rows
              return (
                <button
                  key={i}
                  type="button"
                  aria-label={`${cols}列 × ${rows}行の表`}
                  onMouseDown={(e) => e.preventDefault()}
                  onPointerEnter={() => setSize({ cols, rows })}
                  onFocus={() => setSize({ cols, rows })}
                  onClick={() => {
                    onPick(cols, rows)
                    close()
                  }}
                  className={`h-5 w-5 rounded-sm border transition-colors ${
                    active
                      ? 'border-accent bg-accent-soft'
                      : 'border-border bg-bg'
                  }`}
                />
              )
            })}
          </div>
          <p className="mt-2 text-center font-mono text-xs text-text-muted">
            {size.cols} 列 × {size.rows} 行
          </p>
        </div>
      )}
    </Popover>
  )
}
