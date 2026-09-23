export type TocItem = {
  id: string
  text: string
  level: number
}

const HEADING_RE = /<h([2-4])\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g

/**
 * bodyHtml（旧ブログの変換時に見出しへ id を振り済み）から目次を作る。
 * h1 は記事タイトルと重複しうるので対象外、h2〜h4 のみを拾う。
 */
export function extractToc(html: string): Array<TocItem> {
  const items: Array<TocItem> = []

  for (const match of html.matchAll(HEADING_RE)) {
    const [, level, id, inner] = match
    const text = inner.replace(/<[^>]+>/g, '').trim()
    if (!text) continue

    items.push({ id, text, level: Number(level) })
  }

  return items
}
