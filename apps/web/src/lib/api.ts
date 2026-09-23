import { createApiClient } from '@blog/api-client'

/**
 * Symfony API のクライアントを作る。
 *
 * この関数はサーバー側（サーバー関数・プリレンダリング）からのみ呼ぶ。
 * ブラウザから Symfony を直接叩かせないことで、CORS 設定と
 * API のオリジン露出を避けている。
 */
export function getApiClient() {
  // wrangler.jsonc の vars 前提だと型上は常に string になるが、
  // .env 未設定のまま実行された場合への保険として残す
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const baseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:8000'

  return createApiClient({ baseUrl })
}

/**
 * 管理 API 用のクライアント。共有シークレットを載せる。
 *
 * トークンはサーバー側にしか存在しないため、この関数も
 * サーバー関数の中からのみ呼ぶこと。
 */
export function getAdminApiClient() {
  const adminToken = process.env.ADMIN_TOKEN

  if (!adminToken) {
    throw new Error(
      'ADMIN_TOKEN が設定されていません。apps/web/.env を確認してください。',
    )
  }

  return createApiClient({
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- 上の getApiClient と同じ理由
    baseUrl: process.env.API_BASE_URL ?? 'http://127.0.0.1:8000',
    adminToken,
  })
}

/** 一覧の1ページあたりの件数。サイト全体で揃える。 */
export const POSTS_PER_PAGE = 10
