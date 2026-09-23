import { createApiClient } from '@blog/api-client'
import { edgeCachedFetch } from './edgeCache'
import { clearSessionToken, readSessionToken } from './session'

/**
 * Symfony API のクライアントを作る。
 *
 * この関数群はサーバー側（サーバー関数・サーバールート・プリレンダリング）からのみ呼ぶ。
 * ブラウザから Symfony を直接叩かせないことで、CORS 設定と
 * API のオリジン露出を避けている。
 */
function apiBaseUrl() {
  // wrangler.jsonc の vars 前提だと型上は常に string になるが、
  // .env 未設定のまま実行された場合への保険として残す
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  return process.env.API_BASE_URL ?? 'http://127.0.0.1:8000'
}

/**
 * 公開 API 用（ログイン状態を載せない）。
 *
 * 公開 API の応答は誰に対しても同じなので、GET はエッジでキャッシュする。
 * ログイン中の人が見ている画面でも、公開データはこちらで取る。
 */
export function getApiClient() {
  return createApiClient({ baseUrl: apiBaseUrl(), fetch: edgeCachedFetch })
}

/**
 * ログイン中の本人として API を叩くクライアント。
 * Cookie のセッショントークンを Bearer に載せ替える。未ログインなら null。
 */
export function getSessionApiClient() {
  const sessionToken = readSessionToken()
  if (!sessionToken) return null

  const client = createApiClient({ baseUrl: apiBaseUrl(), sessionToken })

  // 期限切れ・停止などでトークンが通らなくなったら Cookie を捨てる
  client.fetch.use({
    onResponse({ response }) {
      if (response.status === 401) clearSessionToken()
    },
  })

  return client
}

/** セッショントークンなしで叩くクライアント（ログイン処理そのもの用）。キャッシュを通さない。 */
export function getAuthApiClient() {
  return createApiClient({ baseUrl: apiBaseUrl() })
}

/** アーカイブ一覧の1ページあたりの件数。 */
export const POSTS_PER_PAGE = 10
