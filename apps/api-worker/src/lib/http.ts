import { monotonicFactory } from 'ulid'

/**
 * API のエラー。onError（src/index.ts）が `{ message, errors }` の JSON に変換する。
 * Symfony 時代の ApiExceptionSubscriber と同じ形。
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly errors: Record<string, string> = {},
    readonly headers: Record<string, string> = {},
  ) {
    super(message)
  }
}

export const notFound = (message = 'リソースが見つかりません。') =>
  new ApiError(404, message)

export const forbidden = (message = 'この操作を行う権限がありません。') =>
  new ApiError(403, message)

/** フィールド単位の入力エラー（422）。 */
export const invalid = (field: string, message: string) =>
  new ApiError(422, '入力内容に誤りがあります。', { [field]: message })

export function errorBody(message: string, errors: Record<string, string> = {}) {
  return { message, errors }
}

/** 公開 GET のキャッシュ方針（秒）。Worker のエッジキャッシュが s-maxage を見る。 */
export const CacheFor = {
  /** ロビー・部屋・スレッド・タグ。新着の鮮度を優先する */
  FRESH: 15,
  /** 人気の部屋・会社。集計が重く、数分の遅れは問題にならない */
  AGGREGATE: 300,
  /** 旧ブログのアーカイブ。更新されない */
  ARCHIVE: 3600,
} as const

export const publicCache = (seconds: number) => ({
  'Cache-Control': `public, max-age=0, s-maxage=${seconds}`,
})

export const privateCache = { 'Cache-Control': 'private, no-store' }

// ---------- ID とカーソル ----------

const ULID_PATTERN = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/

export const isUlid = (value: string) => ULID_PATTERN.test(value)

const nextUlid = monotonicFactory()

/** 同じミリ秒内でも単調増加する ULID（カーソルページングが id 順に依存するため）。 */
export const newId = () => nextUlid()

export const PAGE_SIZE = 20

/** ?cursor= の値（直前のページの最後の ID）。 */
export function parseCursor(cursor: string | undefined): string | null {
  if (cursor === undefined || cursor === '') return null
  const upper = cursor.toUpperCase()
  if (!isUlid(upper)) throw new ApiError(400, 'cursor が不正です。')
  return upper
}

/** 1件多く取った結果から、ページと次のカーソルを作る。 */
export function toPage<T extends { id: string }>(rows: T[], limit: number) {
  const items = rows.slice(0, limit)
  return {
    items,
    nextCursor: rows.length > limit ? items[items.length - 1].id : null,
  }
}

// ---------- 日時 ----------

/** PHP の DateTimeInterface::ATOM と同じ形（2026-09-23T10:00:00+00:00）。 */
export function iso(date: Date): string
export function iso(date: Date | null | undefined): string | null
export function iso(date: Date | null | undefined): string | null {
  if (!date) return null
  return date.toISOString().replace(/\.\d{3}Z$/, '+00:00')
}

/** DB に入れる現在時刻。列は秒精度なので、ミリ秒を落として比較のずれを防ぐ。 */
export const now = () => new Date(Math.floor(Date.now() / 1000) * 1000)

export const secondsAgo = (seconds: number) =>
  new Date(now().getTime() - seconds * 1000)

// ---------- LIKE ----------

/** 部分一致の LIKE パターン（ESCAPE '\' と組で使う）。 */
export function likePattern(term: string): string {
  return `%${term.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}
