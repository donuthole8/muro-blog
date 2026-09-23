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
