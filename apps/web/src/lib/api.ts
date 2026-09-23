import { env } from 'cloudflare:workers'
import { createApiClient } from '@blog/api-client'
import { edgeCachedFetch } from './edgeCache'
import { clearSessionToken, readSessionToken } from './session'

/**
 * API（apps/api-worker）のクライアントを作る。
 *
 * この関数群はサーバー側（サーバー関数・サーバールート・プリレンダリング）からのみ呼ぶ。
 * ブラウザから API を直接叩かせないことで、CORS 設定と API のオリジン露出を避けている。
 *
 * 呼び先は2通り:
 * - 本番: Service Binding（wrangler.jsonc の services）。workers.dev 上の Worker から
 *   同じアカウントの別の Worker を URL で fetch すると弾かれる（1042）ので、必ずこちらを使う
 * - ローカル開発とビルド時のプリレンダリング: .env の API_BASE_URL に HTTP で繋ぐ
 */
const BINDING_BASE_URL = 'https://api.internal'

function apiBaseUrl() {
  return process.env.API_BASE_URL || BINDING_BASE_URL
}

/** 呼び先に応じた fetch。Service Binding なら env.API に渡す。 */
function upstreamFetch(request: Request): Promise<Response> {
  if (process.env.API_BASE_URL) return fetch(request)
  return env.API.fetch(request)
}

/**
 * 公開 API 用（ログイン状態を載せない）。
 *
 * 公開 API の応答は誰に対しても同じなので、GET はエッジでキャッシュする。
 * ログイン中の人が見ている画面でも、公開データはこちらで取る。
 */
export function getApiClient() {
  return createApiClient({
    baseUrl: apiBaseUrl(),
    fetch: (request) => edgeCachedFetch(request, upstreamFetch),
  })
}

/**
 * ログイン中の本人として API を叩くクライアント。
 * Cookie のセッショントークンを Bearer に載せ替える。未ログインなら null。
 */
export function getSessionApiClient() {
  const sessionToken = readSessionToken()
  if (!sessionToken) return null

  const client = createApiClient({
    baseUrl: apiBaseUrl(),
    sessionToken,
    fetch: upstreamFetch,
  })

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
  return createApiClient({ baseUrl: apiBaseUrl(), fetch: upstreamFetch })
}

/** アーカイブ一覧の1ページあたりの件数。 */
export const POSTS_PER_PAGE = 10
