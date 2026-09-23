import {
  deleteCookie,
  getCookie,
  setCookie,
} from '@tanstack/react-start/server'

/**
 * ログインセッションの Cookie（サーバー側専用）。
 *
 * 中身は API が発行したセッショントークン。HttpOnly なのでブラウザの JS からは読めず、
 * Worker が API を呼ぶときに Authorization: Bearer に載せ替える。
 * このモジュールはサーバー関数・サーバールートからのみ呼ぶこと。
 */
export const SESSION_COOKIE = 'session'

/** OAuth の state（CSRF 対策）とログイン後の戻り先を一時的に控える Cookie */
export const OAUTH_STATE_COOKIE = 'oauth_state'
export const RETURN_TO_COOKIE = 'return_to'

/** 本番（https）でだけ Secure を付ける。http://localhost の開発で Cookie が落ちないように。 */
function isSecure(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- .env 未設定時の保険
  return (process.env.SITE_URL ?? '').startsWith('https://')
}

export function readSessionToken(): string | undefined {
  return getCookie(SESSION_COOKIE)
}

export function storeSessionToken(token: string, expiresAt: string) {
  setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isSecure(),
    sameSite: 'lax',
    path: '/',
    expires: new Date(expiresAt),
  })
}

export function clearSessionToken() {
  deleteCookie(SESSION_COOKIE, { path: '/' })
}

/**
 * サーバールート（Response を自前で組み立てる所）用の Set-Cookie ヘッダー値。
 * サーバー関数では上の setCookie 系を使う。
 */
export function serializeCookie(
  name: string,
  value: string,
  options: { maxAge?: number; expires?: Date } = {},
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ]
  if (isSecure()) parts.push('Secure')
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`)
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`)

  return parts.join('; ')
}

export function readCookieFrom(request: Request, name: string) {
  const header = request.headers.get('Cookie') ?? ''
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return decodeURIComponent(rest.join('='))
  }
  return undefined
}

/** 外部サイトへのオープンリダイレクトにならないよう、サイト内のパスだけを許す。 */
export function safeReturnTo(value: string | null | undefined): string {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.startsWith('/\\')
  ) {
    return '/'
  }
  return value
}
