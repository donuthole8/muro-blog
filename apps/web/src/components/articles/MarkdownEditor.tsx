import { useEffect, useRef } from 'react'
import { EditorState, Prec } from '@codemirror/state'
import type { Extension, Range } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  drawSelection,
  dropCursor,
  keymap,
  placeholder as placeholderText,
} from '@codemirror/view'
import type { DecorationSet, ViewUpdate } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import {
  HighlightStyle,
  syntaxHighlighting,
  syntaxTree,
} from '@codemirror/language'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { tags as t } from '@lezer/highlight'
import type { SyntaxNode, SyntaxNodeRef } from '@lezer/common'
import { MarkdownToolbar } from '../MarkdownToolbar'
import {
  formatMarkdown,
  insertTable,
  pasteAsLink,
} from '../../lib/markdownFormat'
import type {
  FormatCommand,
  Selection,
  TextChange,
} from '../../lib/markdownFormat'

type Props = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /**
   * 画像のペースト・ドロップを受けたときに呼ばれる。
   * 返した URL が `![]()` として本文に挿入される。
   * 渡さなければペースト・ドロップは素通しする（通常のテキストとして扱う）。
   */
  onImageDrop?: (file: File) => Promise<string>
}

/**
 * Typora 風に「書いたそばから見た目が整う」Markdown エディタ。
 *
 * 保存するのは入力した Markdown 原文そのもの。
 * 見出しを大きくする・記法を隠すといった処理は表示上の装飾だけで、
 * テキストには手を加えない（HTML への変換は API 側。api-worker の lib/markdown.ts）。
 */
export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  onImageDrop,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  // エディタは一度しか作らないので、最新のコールバックは ref 越しに呼ぶ
  const onChangeRef = useRef(onChange)
  const onImageDropRef = useRef(onImageDrop)

  useEffect(() => {
    onChangeRef.current = onChange
    onImageDropRef.current = onImageDrop
  })

  useEffect(() => {
    const view = new EditorView({
      parent: containerRef.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          editorExtensions,
          placeholderText(placeholder ?? ''),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString())
            }
          }),
          EditorView.domEventHandlers({
            paste(event, editorView) {
              const text = event.clipboardData?.getData('text/plain') ?? ''
              if (
                applyChange(editorView, (doc, sel) =>
                  pasteAsLink(doc, sel, text),
                )
              ) {
                event.preventDefault()
                return true
              }

              const handler = onImageDropRef.current
              const file = imageFileFrom(event.clipboardData)
              if (!handler || !file) return false

              event.preventDefault()
              insertUploadedImage(
                editorView,
                editorView.state.selection.main.head,
                file,
                handler,
              )
              return true
            },
            drop(event, editorView) {
              const handler = onImageDropRef.current
              const file = imageFileFrom(event.dataTransfer)
              if (!handler || !file) return false

              event.preventDefault()
              const pos =
                editorView.posAtCoords({
                  x: event.clientX,
                  y: event.clientY,
                }) ?? editorView.state.selection.main.head
              insertUploadedImage(editorView, pos, file, handler)
              return true
            },
          }),
        ],
      }),
    })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // 初期値だけを使う。以降の外部からの変更は下の effect で反映する
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return

    const current = view.state.doc.toString()
    if (current === value) return

    view.dispatch({ changes: { from: 0, to: current.length, insert: value } })
  }, [value])

  const format = (compute: (doc: string, sel: Selection) => TextChange) => {
    const view = viewRef.current
    if (view) applyChange(view, compute)
  }

  return (
    <div className="min-w-0 rounded-md border border-border bg-surface transition-colors focus-within:border-accent">
      {/* 長い記事でも押せるよう、サイトのヘッダー（h-14）の下に貼り付ける */}
      <MarkdownToolbar
        blocks
        onFormat={(command) =>
          format((doc, sel) => formatMarkdown(doc, sel, command))
        }
        onInsertTable={(cols, rows) =>
          format((doc, sel) => insertTable(doc, sel, cols, rows))
        }
        className="sticky top-14 z-10 rounded-t-md border-b border-border bg-surface"
      />
      <div ref={containerRef} className="min-h-96" />
    </div>
  )
}

/** markdownFormat の書き換えをエディタに反映する。書き換えなかったら false。 */
function applyChange(
  view: EditorView,
  compute: (doc: string, sel: Selection) => TextChange | null,
): boolean {
  const { main } = view.state.selection
  const change = compute(view.state.doc.toString(), {
    from: main.from,
    to: main.to,
  })
  if (!change) return false

  view.dispatch({
    changes: { from: change.from, to: change.to, insert: change.insert },
    selection: { anchor: change.selection.from, head: change.selection.to },
    scrollIntoView: true,
    userEvent: 'input.format',
  })
  view.focus()
  return true
}

/* ------------------------------------------------------------------ */
/* 画像のペースト・ドロップ                                              */
/* ------------------------------------------------------------------ */

function imageFileFrom(data: DataTransfer | null): File | null {
  if (!data) return null

  return (
    Array.from(data.files).find((file) => file.type.startsWith('image/')) ??
    null
  )
}

/**
 * アップロード中はプレースホルダーの文字列を挿入しておき、
 * 完了したら同じ文字列を探して本物の Markdown に置き換える。
 * 挿入位置を数値で覚えておくと、その間の編集でずれてしまうため。
 */
async function insertUploadedImage(
  view: EditorView,
  pos: number,
  file: File,
  upload: (file: File) => Promise<string>,
) {
  const placeholder = `![アップロード中: ${file.name}…]()`

  view.dispatch({
    changes: { from: pos, to: pos, insert: placeholder },
    selection: { anchor: pos + placeholder.length },
  })

  const replacePlaceholder = (replacement: string) => {
    const current = view.state.doc.toString()
    const index = current.indexOf(placeholder)
    // 差し替え待ちの間に編集されて消えていたら何もしない
    if (index === -1) return

    view.dispatch({
      changes: {
        from: index,
        to: index + placeholder.length,
        insert: replacement,
      },
    })
  }

  try {
    const url = await upload(file)
    replacePlaceholder(`![](${url})`)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'アップロードに失敗しました'
    replacePlaceholder(`<!-- 画像のアップロードに失敗しました: ${message} -->`)
  }
}

/* ------------------------------------------------------------------ */
/* ライブプレビュー: 構文木を見て装飾を付ける                              */
/* ------------------------------------------------------------------ */

const hidden = Decoration.replace({})

class BulletWidget extends WidgetType {
  eq() {
    return true
  }

  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-md-bullet'
    span.textContent = '•'
    return span
  }
}

class HorizontalRuleWidget extends WidgetType {
  eq() {
    return true
  }

  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-md-hr'
    return span
  }
}

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super()
  }

  eq(other: CheckboxWidget) {
    return other.checked === this.checked
  }

  toDOM(view: EditorView) {
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.checked = this.checked
    input.className = 'cm-md-task'
    // カーソルが行に入ると記法が表に出てしまうので、クリックでは移動させない
    input.addEventListener('mousedown', (e) => e.preventDefault())
    input.addEventListener('click', () => {
      // posAtDOM は置き換えた "[ ]" の先頭を指す。中の1文字を書き換える
      const pos = view.posAtDOM(input)
      view.dispatch({
        changes: {
          from: pos + 1,
          to: pos + 2,
          insert: this.checked ? ' ' : 'x',
        },
      })
    })
    return input
  }

  ignoreEvent() {
    return true
  }
}

const bullet = Decoration.replace({ widget: new BulletWidget() })
const horizontalRule = Decoration.replace({
  widget: new HorizontalRuleWidget(),
})

/** インライン要素ごとの「隠す記法」 */
const inlineMarks: Record<string, string> = {
  Emphasis: 'EmphasisMark',
  StrongEmphasis: 'EmphasisMark',
  Strikethrough: 'StrikethroughMark',
  InlineCode: 'CodeMark',
}

function childrenNamed(node: SyntaxNode, name: string) {
  const found: Array<SyntaxNode> = []
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === name) found.push(child)
  }
  return found
}

function buildDecorations(view: EditorView): DecorationSet {
  const { state } = view
  const { doc } = state
  const decorations: Array<Range<Decoration>> = []

  // カーソルが触れている箇所は記法をそのまま見せる（Typora と同じ挙動）。
  // フォーカスが外れているときは全体を整形済みの見た目にする
  const touches = (from: number, to: number) =>
    view.hasFocus &&
    state.selection.ranges.some((r) => r.from <= to && r.to >= from)

  const touchesLine = (pos: number) => {
    const line = doc.lineAt(pos)
    return touches(line.from, line.to)
  }

  /** "# " や "> " のように直後の空白までまとめて隠す */
  const withSpace = (pos: number) =>
    state.sliceDoc(pos, pos + 1) === ' ' ? pos + 1 : pos

  const lineClass = (pos: number, className: string) =>
    decorations.push(
      Decoration.line({ class: className }).range(doc.lineAt(pos).from),
    )

  const eachLine = (
    node: SyntaxNodeRef,
    className: (isFirst: boolean, isLast: boolean) => string,
  ) => {
    const first = doc.lineAt(node.from).number
    const last = doc.lineAt(node.to).number
    for (let n = first; n <= last; n++) {
      lineClass(doc.line(n).from, className(n === first, n === last))
    }
  }

  syntaxTree(state).iterate({
    from: view.viewport.from,
    to: view.viewport.to,
    enter: (node) => {
      const heading = /^(?:ATX|Setext)Heading(\d)$/.exec(node.name)
      if (heading) {
        lineClass(node.from, `cm-md-heading cm-md-h${heading[1]}`)
        return
      }

      const markName = inlineMarks[node.name]
      if (markName) {
        const marks = childrenNamed(node.node, markName)

        if (node.name === 'InlineCode' && marks.length >= 2) {
          const open = marks[0].to
          const close = marks[marks.length - 1].from
          if (open < close) {
            decorations.push(
              Decoration.mark({ class: 'cm-md-inline-code' }).range(
                open,
                close,
              ),
            )
          }
        }

        if (!touches(node.from, node.to)) {
          for (const mark of marks) {
            decorations.push(hidden.range(mark.from, mark.to))
          }
        }
        return
      }

      switch (node.name) {
        case 'HeaderMark':
          // "#" は公開ページでも装飾として出しているので、ここでも隠さない。
          // 色は markdownHighlight の processingInstruction で薄くしている。
          return

        case 'QuoteMark':
          lineClass(node.from, 'cm-md-quote')
          if (!touchesLine(node.from)) {
            decorations.push(hidden.range(node.from, withSpace(node.to)))
          }
          return

        case 'ListMark': {
          if (touchesLine(node.from)) return
          if (node.node.parent?.parent?.name !== 'BulletList') return

          // タスクリストは "- " を隠してチェックボックスだけを見せる
          if (node.node.nextSibling?.name === 'Task') {
            decorations.push(hidden.range(node.from, withSpace(node.to)))
          } else {
            decorations.push(bullet.range(node.from, node.to))
          }
          return
        }

        case 'TaskMarker': {
          if (touchesLine(node.from)) return
          const checked = /x/i.test(state.sliceDoc(node.from + 1, node.to - 1))
          decorations.push(
            Decoration.replace({ widget: new CheckboxWidget(checked) }).range(
              node.from,
              node.to,
            ),
          )
          return
        }

        case 'Link': {
          // [text](url) の形だけを整形する。参照リンクなどは生のまま見せる
          const marks = childrenNamed(node.node, 'LinkMark')
          if (marks.length < 4) return
          if (state.sliceDoc(marks[2].from, marks[2].to) !== '(') return

          const [open, close] = marks
          if (open.to >= close.from) return

          decorations.push(
            Decoration.mark({ class: 'cm-md-link' }).range(open.to, close.from),
          )
          if (!touches(node.from, node.to)) {
            decorations.push(hidden.range(open.from, open.to))
            decorations.push(hidden.range(close.from, node.to))
          }
          return
        }

        case 'HorizontalRule':
          if (!touchesLine(node.from)) {
            decorations.push(horizontalRule.range(node.from, node.to))
          }
          return

        case 'FencedCode':
        case 'CodeBlock':
          eachLine(node, (isFirst, isLast) =>
            [
              'cm-md-codeblock',
              isFirst && 'cm-md-codeblock-begin',
              isLast && 'cm-md-codeblock-end',
            ]
              .filter(Boolean)
              .join(' '),
          )
          return false

        case 'Table':
          // 列がそろって見えるよう等幅にする
          eachLine(node, () => 'cm-md-table')
          return false
      }
    },
  })

  return Decoration.set(decorations, true)
}

const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged ||
        update.focusChanged ||
        // 構文解析は非同期に進むので、木が更新されたときも作り直す
        syntaxTree(update.startState) !== syntaxTree(update.state)
      ) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
)

/* ------------------------------------------------------------------ */
/* 見た目                                                               */
/* ------------------------------------------------------------------ */

const monoFont = 'var(--font-mono)'

const markdownHighlight = HighlightStyle.define([
  { tag: t.heading, fontWeight: '700' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, color: 'var(--accent)' },
  { tag: t.monospace, fontFamily: monoFont },
  // # * ` > [ ] などの記法そのもの・URL は控えめに
  {
    tag: [t.processingInstruction, t.url, t.labelName, t.contentSeparator],
    color: 'var(--text-muted)',
  },
  { tag: [t.quote, t.comment], color: 'var(--text-muted)' },
])

const editorTheme = EditorView.theme({
  '&': {
    color: 'var(--text)',
    backgroundColor: 'transparent',
    fontSize: '1rem',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'inherit', lineHeight: '1.8' },
  '.cm-content': {
    minHeight: '24rem',
    padding: '1rem 1.25rem',
    caretColor: 'var(--text)',
  },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--text)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
    { backgroundColor: 'var(--accent-soft)' },
  '.cm-placeholder': { color: 'var(--text-muted)' },

  // 見出し（公開ページの prose と同じ比率・同じ罫線に揃える）
  '.cm-md-heading': { fontWeight: '700', lineHeight: '1.5' },
  '.cm-md-h1': {
    fontSize: '1.75em',
    paddingTop: '0.8em',
    paddingBottom: '0.3em',
    marginBottom: '0.4em',
    borderBottom: '1px solid var(--border)',
  },
  '.cm-md-h2': {
    fontSize: '1.5em',
    paddingTop: '0.8em',
    paddingBottom: '0.3em',
    marginBottom: '0.4em',
    borderBottom: '1px solid var(--border)',
  },
  '.cm-md-h3': { fontSize: '1.25em', paddingTop: '0.6em' },
  '.cm-md-h4': { fontSize: '1.1em', paddingTop: '0.4em' },

  '.cm-md-quote': {
    borderLeft: '3px solid var(--border)',
    paddingLeft: '1em',
    color: 'var(--text-muted)',
  },

  '.cm-md-inline-code': {
    fontFamily: monoFont,
    fontSize: '0.875em',
    backgroundColor: 'var(--code-bg)',
    border: '1px solid var(--border)',
    borderRadius: '0.25rem',
    padding: '0.1em 0.35em',
  },

  '.cm-md-codeblock': {
    fontFamily: monoFont,
    fontSize: '0.875em',
    backgroundColor: 'var(--code-bg)',
    paddingLeft: '1em',
    paddingRight: '1em',
  },
  '.cm-md-codeblock-begin': {
    borderTopLeftRadius: '0.375rem',
    borderTopRightRadius: '0.375rem',
    paddingTop: '0.5em',
  },
  '.cm-md-codeblock-end': {
    borderBottomLeftRadius: '0.375rem',
    borderBottomRightRadius: '0.375rem',
    paddingBottom: '0.5em',
  },

  '.cm-md-table': { fontFamily: monoFont, fontSize: '0.875em' },

  '.cm-md-link': {
    textDecoration: 'underline',
    textUnderlineOffset: '0.2em',
  },

  '.cm-md-bullet': { color: 'var(--text-muted)' },
  '.cm-md-task': {
    margin: '0 0.3em 0 0',
    verticalAlign: 'middle',
    accentColor: 'var(--accent)',
    cursor: 'pointer',
  },
  '.cm-md-hr': {
    display: 'inline-block',
    width: '100%',
    verticalAlign: 'middle',
    borderTop: '1px solid var(--border)',
  },
})

/**
 * 書式のショートカット（textarea 側は markdownFormat の shortcutCommand）。
 * 既定のキーマップの Mod-i（構文単位の選択）より優先させる。
 */
const formatKeymap = Prec.high(
  keymap.of(
    (
      [
        ['Mod-b', 'bold'],
        ['Mod-i', 'italic'],
        ['Mod-Shift-x', 'strike'],
        ['Mod-k', 'link'],
      ] as const
    ).map(([key, command]: readonly [string, FormatCommand]) => ({
      key,
      run: (view: EditorView) =>
        applyChange(view, (doc, sel) => formatMarkdown(doc, sel, command)),
    })),
  ),
)

const editorExtensions: Extension = [
  formatKeymap,
  history(),
  drawSelection(),
  dropCursor(),
  EditorView.lineWrapping,
  EditorView.contentAttributes.of({ 'aria-label': '本文' }),
  markdown({ base: markdownLanguage }),
  syntaxHighlighting(markdownHighlight),
  livePreview,
  keymap.of([...defaultKeymap, ...historyKeymap]),
  editorTheme,
]
