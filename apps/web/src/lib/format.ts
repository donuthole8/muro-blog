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

const timeOfDayFormatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  hour: '2-digit',
  minute: '2-digit',
})

const dayLabelFormatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
})

/** 同じ日かどうかを比べるための鍵。en-CA は YYYY-MM-DD で返る。 */
const dayKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** ログ行の左端に出す時刻（HH:MM）。日付は日付区切りが持つので入れない。 */
export function formatTimeOfDay(isoString: string): string {
  return timeOfDayFormatter.format(new Date(isoString))
}

/** 日付区切りの見出し（2026/09/23(火)）。 */
export function formatDayLabel(isoString: string): string {
  return dayLabelFormatter.format(new Date(isoString))
}

/** 投稿が同じ日かどうかの判定に使う（東京時間の YYYY-MM-DD）。 */
export function dayKey(isoString: string): string {
  return dayKeyFormatter.format(new Date(isoString))
}

/** 2つの時刻の間隔（分）。どちらが先でもよい。 */
export function minutesBetween(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 60000
}

/**
 * 投稿と投稿の間が空いたときの表示。
 * 現在時刻には依存しないので、SSR とクライアントで結果が揃う。
 */
export function formatGap(minutes: number): string {
  const hours = Math.floor(minutes / 60)

  return hours < 24 ? `${hours}時間の空き` : `${Math.floor(hours / 24)}日の空き`
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
