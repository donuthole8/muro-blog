/**
 * ツールバーやショートカットから Markdown の記法を差し込む処理。
 *
 * textarea（投稿）と CodeMirror（記事）の両方で使うので、DOM には触らず
 * 「本文と選択範囲を受け取り、置き換える範囲と新しい選択範囲を返す」純粋な関数にしてある。
 * 実際に書き換えるのはそれぞれのエディタ側（useMarkdownTextarea / MarkdownEditor）。
 */

export type Selection = { from: number; to: number }

export type TextChange = {
  from: number
  to: number
  insert: string
  /** 書き換えたあとの選択範囲 */
  selection: Selection
}

export type FormatCommand =
  | 'bold'
  | 'italic'
  | 'strike'
  | 'code'
  | 'link'
  | 'heading'
  | 'quote'
  | 'bulletList'
  | 'orderedList'
  | 'codeBlock'
  | 'hr'

export function formatMarkdown(
  doc: string,
  sel: Selection,
  command: FormatCommand,
): TextChange {
  switch (command) {
    case 'bold':
      return toggleInline(doc, sel, '**')
    case 'italic':
      return toggleInline(doc, sel, '*')
    case 'strike':
      return toggleInline(doc, sel, '~~')
    case 'code':
      return toggleInline(doc, sel, '`')
    case 'link':
      return insertLink(doc, sel)
    case 'heading':
      return cycleHeading(doc, sel)
    case 'quote':
      return toggleLinePrefix(doc, sel, () => '> ')
    case 'bulletList':
      return toggleLinePrefix(doc, sel, () => '- ')
    case 'orderedList':
      return toggleLinePrefix(doc, sel, (i) => `${i + 1}. `)
    case 'codeBlock':
      return insertCodeBlock(doc, sel)
    case 'hr':
      return insertBlock(doc, sel, '---', 3)
  }
}

/** 列数・行数（見出し行を除く）を指定して表のひな形を差し込む。最初の見出しセルを選択した状態にする。 */
export function insertTable(
  doc: string,
  sel: Selection,
  cols: number,
  rows: number,
): TextChange {
  const headers = Array.from({ length: cols }, (_, i) => `列${i + 1}`)
  const lines = [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...Array.from(
      { length: rows },
      () => `| ${headers.map(() => ' ').join(' | ')} |`,
    ),
  ]
  const change = insertBlock(doc, sel, lines.join('\n'), 0)
  const start = change.selection.from + 2
  return {
    ...change,
    selection: { from: start, to: start + headers[0].length },
  }
}

/** キー入力を対応する記法に変換する（Slack / GitHub に合わせる）。 */
export function shortcutCommand(e: {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}): FormatCommand | null {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return null
  const key = e.key.toLowerCase()
  if (e.shiftKey) return key === 'x' ? 'strike' : null
  if (key === 'b') return 'bold'
  if (key === 'i') return 'italic'
  if (key === 'k') return 'link'
  return null
}

/**
 * 文字列を選んだ状態で URL を貼り付けたら、選んだ文字列をリンクにする（Slack と同じ）。
 * リンクにしないときは null。
 */
export function pasteAsLink(
  doc: string,
  sel: Selection,
  pasted: string,
): TextChange | null {
  const url = pasted.trim()
  if (sel.from === sel.to || !isUrl(url)) return null
  const text = doc.slice(sel.from, sel.to)
  if (text.includes('\n') || isUrl(text)) return null

  const insert = `[${text}](${url})`
  const end = sel.from + insert.length
  return {
    from: sel.from,
    to: sel.to,
    insert,
    selection: { from: end, to: end },
  }
}

/* ------------------------------------------------------------------ */
/* インライン                                                           */
/* ------------------------------------------------------------------ */

/** 選択範囲を記号で囲む。すでに囲まれていれば外す。 */
function toggleInline(doc: string, sel: Selection, mark: string): TextChange {
  const { from, to } = sel
  const text = doc.slice(from, to)

  // 選択範囲の外側に記号がある: **|太字|**
  if (isWrappedOutside(doc, sel, mark)) {
    const start = from - mark.length
    return {
      from: start,
      to: to + mark.length,
      insert: text,
      selection: { from: start, to: start + text.length },
    }
  }

  // 記号ごと選んでいる: |**太字**|
  if (
    text.length >= mark.length * 2 &&
    text.startsWith(mark) &&
    text.endsWith(mark)
  ) {
    const inner = text.slice(mark.length, text.length - mark.length)
    return {
      from,
      to,
      insert: inner,
      selection: { from, to: from + inner.length },
    }
  }

  // 何も選んでいなければ記号だけ置いて、その間にカーソルを置く
  const start = from + mark.length
  return {
    from,
    to,
    insert: `${mark}${text}${mark}`,
    selection: { from: start, to: start + text.length },
  }
}

function isWrappedOutside(doc: string, sel: Selection, mark: string): boolean {
  const char = mark[0]
  const before = runLength(doc, sel.from - 1, -1, char)
  const after = runLength(doc, sel.to, 1, char)
  if (before < mark.length || after < mark.length) return false
  // * と ** を取り違えない（***太字斜体*** はどちらとしても外せる）
  if (mark === '*') return before !== 2
  if (mark === '**') return before !== 1
  return true
}

/** pos から step の向きに char が何文字続くか。 */
function runLength(doc: string, pos: number, step: 1 | -1, char: string) {
  let n = 0
  for (let i = pos; i >= 0 && i < doc.length && doc[i] === char; i += step) n++
  return n
}

function insertLink(doc: string, sel: Selection): TextChange {
  const text = doc.slice(sel.from, sel.to)

  // URL を選んでいたら、それをリンク先にして表示する文字列を書いてもらう
  if (isUrl(text.trim())) {
    const insert = `[](${text.trim()})`
    const cursor = sel.from + 1
    return { ...sel, insert, selection: { from: cursor, to: cursor } }
  }

  // それ以外はリンク先の欄を選んだ状態にして、そのまま URL を貼れるようにする
  const url = 'https://'
  const insert = `[${text}](${url})`
  const urlStart = sel.from + text.length + 3
  return {
    ...sel,
    insert,
    selection: { from: urlStart, to: urlStart + url.length },
  }
}

function isUrl(text: string): boolean {
  return /^https?:\/\/\S+$/.test(text)
}

/* ------------------------------------------------------------------ */
/* 行頭の記法                                                           */
/* ------------------------------------------------------------------ */

type LineRange = { from: number; to: number; lines: string[] }

/** 選択範囲がかかっている行全体。 */
function linesOf(doc: string, sel: Selection): LineRange {
  const from = sel.from === 0 ? 0 : doc.lastIndexOf('\n', sel.from - 1) + 1
  // 次の行の先頭までドラッグで選んだときは、その行を含めない
  const end =
    sel.to > sel.from && doc[sel.to - 1] === '\n' ? sel.to - 1 : sel.to
  const next = doc.indexOf('\n', end)
  const to = next === -1 ? doc.length : next
  return { from, to, lines: doc.slice(from, to).split('\n') }
}

/** 行頭の引用・リスト記号。入れ替えるときにまとめて外す。 */
const BLOCK_PREFIX = /^(\s*)(?:[-*+] |\d+[.)] |> )/

function toggleLinePrefix(
  doc: string,
  sel: Selection,
  prefixFor: (index: number) => string,
): TextChange {
  const range = linesOf(doc, sel)
  const target = range.lines.filter((line) => line.trim() !== '')
  const prefixPattern = new RegExp(
    `^\\s*${escapeRegExp(prefixFor(0)).replace('1', '\\d+')}`,
  )
  // 全部の行にすでに付いていれば外す。そうでなければ（別の記号を外して）付ける
  const remove =
    target.length > 0 && target.every((line) => prefixPattern.test(line))

  let index = 0
  const lines = range.lines.map((line) => {
    if (line.trim() === '' && range.lines.length > 1) return line
    const bare = line.replace(BLOCK_PREFIX, '$1')
    if (remove) return bare
    // 字下げ（入れ子のリスト）は残して、その後ろに記号を付ける
    const indent = /^\s*/.exec(bare)![0]
    return indent + prefixFor(index++) + bare.slice(indent.length)
  })
  return replaceLines(sel, range, lines)
}

/** なし → ## → ### → なし の順に切り替える。 */
function cycleHeading(doc: string, sel: Selection): TextChange {
  const range = linesOf(doc, sel)
  const level = /^(#{1,6}) /.exec(range.lines[0])?.[1].length ?? 0
  const next = level === 0 ? '## ' : level === 2 ? '### ' : ''
  const lines = range.lines.map(
    (line) => next + line.replace(/^#{1,6} /, '').replace(BLOCK_PREFIX, '$1'),
  )
  return replaceLines(sel, range, lines)
}

/**
 * 行を差し替える。カーソルだけなら同じ文字の位置にカーソルを残し、
 * 範囲を選んでいたら差し替えた行全体を選ぶ。
 */
function replaceLines(
  sel: Selection,
  range: LineRange,
  lines: string[],
): TextChange {
  const insert = lines.join('\n')
  if (sel.from !== sel.to || range.lines.length > 1) {
    return {
      from: range.from,
      to: range.to,
      insert,
      selection: { from: range.from, to: range.from + insert.length },
    }
  }

  const delta = insert.length - (range.to - range.from)
  const cursor = Math.min(
    range.from + insert.length,
    Math.max(range.from, sel.from + delta),
  )
  return {
    from: range.from,
    to: range.to,
    insert,
    selection: { from: cursor, to: cursor },
  }
}

/* ------------------------------------------------------------------ */
/* ブロック                                                             */
/* ------------------------------------------------------------------ */

function insertCodeBlock(doc: string, sel: Selection): TextChange {
  if (sel.from === sel.to) {
    // 開きの ``` の直後にカーソルを置き、言語名を書けるようにする
    return insertBlock(doc, sel, '```\n\n```', 3)
  }
  const range = linesOf(doc, sel)
  const code = doc.slice(range.from, range.to)
  return insertBlock(doc, range, `\`\`\`\n${code}\n\`\`\``, 3)
}

/**
 * 選択範囲を block に置き換える。前後の段落とくっつかないよう空行を補う。
 * cursor は block の中でカーソルを置く位置。
 */
function insertBlock(
  doc: string,
  sel: Selection,
  block: string,
  cursor: number,
): TextChange {
  const before = doc.slice(0, sel.from)
  const after = doc.slice(sel.to)
  const lead =
    before === '' || before.endsWith('\n\n')
      ? ''
      : before.endsWith('\n')
        ? '\n'
        : '\n\n'
  const trail =
    after === '' || after.startsWith('\n\n')
      ? ''
      : after.startsWith('\n')
        ? '\n'
        : '\n\n'

  const start = sel.from + lead.length
  return {
    from: sel.from,
    to: sel.to,
    insert: lead + block + trail,
    selection: { from: start + cursor, to: start + cursor },
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
