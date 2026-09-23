/** 日付を YYYY.MM.DD 形式で表示する。SSR とクライアントで結果を揃えるため UTC 固定。 */
export function formatDate(isoString: string): string {
  const date = new Date(isoString)
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')

  return `${y}.${m}.${d}`
}

/**
 * 記事本文（HTML）から推定読了時間を計算する。
 * 日本語の黙読速度（約400〜600字/分）に基づき、500字/分で概算する。
 */
export function estimateReadingMinutes(bodyHtml: string): number {
  const text = bodyHtml.replace(/<[^>]+>/g, '')
  const minutes = Math.ceil(text.length / 500)

  return Math.max(1, minutes)
}

const timeFormatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const fullFormatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

/**
 * 投稿の日時。SSR とクライアントで結果を揃えるため、タイムゾーンを東京に固定し、
 * 「3分前」のような現在時刻に依存する表記は使わない。
 */
export function formatPostTime(isoString: string): string {
  return timeFormatter.format(new Date(isoString))
}

export function formatFullTime(isoString: string): string {
  return fullFormatter.format(new Date(isoString))
}

/** HTML からタグを落とした冒頭（OGP の説明文用）。 */
export function htmlExcerpt(html: string, length = 120): string {
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

  return text.length > length ? `${text.slice(0, length)}…` : text
}
