/**
 * Web Push の送信（RFC 8030 / 8291 / 8292）を WebCrypto だけで行う。
 *
 * Node 向けの web-push ライブラリは Workers で動かないので、必要な部分だけを書いている。
 * - 本文は aes128gcm で暗号化する（RFC 8291）。鍵はブラウザが購読時に渡す p256dh と auth から作る
 * - プッシュサービスへの認証は VAPID（ES256 の JWT, RFC 8292）
 */

export type PushTarget = { endpoint: string; p256dh: string; auth: string }

export type VapidKeys = {
  /** 非圧縮の公開鍵（65 バイト）の base64url。ブラウザの applicationServerKey と同じ値 */
  publicKey: string
  /** 秘密鍵 d（32 バイト）の base64url */
  privateKey: string
  subject: string
}

/** 送信結果。gone は購読が無効になった（消してよい） */
export type PushResult = 'sent' | 'gone' | 'failed'

const encoder = new TextEncoder()

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function base64UrlDecode(input: string): Uint8Array {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '='))
  return Uint8Array.from(binary, (ch) => ch.charCodeAt(0))
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data))
}

/** 本文を aes128gcm で暗号化し、ヘッダー（salt・レコードサイズ・送信側の公開鍵）を前に付ける。 */
export async function encryptPayload(target: PushTarget, payload: Uint8Array): Promise<Uint8Array> {
  const uaPublic = base64UrlDecode(target.p256dh)
  const authSecret = base64UrlDecode(target.auth)

  const ephemeral = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair
  const asPublic = new Uint8Array((await crypto.subtle.exportKey('raw', ephemeral.publicKey)) as ArrayBuffer)
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  // workers-types は予約語を避けて $public と書くが、実行時の（仕様どおりの）名前は public
  const ecdh = { name: 'ECDH', public: uaKey } as unknown as SubtleCryptoDeriveKeyAlgorithm
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits(ecdh, ephemeral.privateKey, 256))

  // RFC 8291 §3.3〜3.4: auth と ECDH の共有鍵から IKM、salt から CEK と nonce を作る（HKDF を HMAC で展開）
  const prkKey = await hmac(authSecret, ecdhSecret)
  const keyInfo = concat(encoder.encode('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1]))
  const ikm = await hmac(prkKey, keyInfo)

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const prk = await hmac(salt, ikm)
  const cek = (await hmac(prk, concat(encoder.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16)
  const nonce = (await hmac(prk, concat(encoder.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12)

  // レコードは1つだけ。末尾の 0x02 が「最後のレコード」の区切り
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, concat(payload, new Uint8Array([2]))),
  )

  const header = new Uint8Array(16 + 4 + 1)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, 4096)
  header[20] = asPublic.length
  return concat(header, asPublic, ciphertext)
}

/** VAPID の Authorization ヘッダー（vapid t=JWT, k=公開鍵）。 */
export async function vapidAuthorization(endpoint: string, keys: VapidKeys): Promise<string> {
  const publicKey = base64UrlDecode(keys.publicKey)
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    d: keys.privateKey,
    x: base64UrlEncode(publicKey.slice(1, 33)),
    y: base64UrlEncode(publicKey.slice(33, 65)),
  }
  const signingKey = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])

  const header = base64UrlEncode(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = base64UrlEncode(
    encoder.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: keys.subject,
      }),
    ),
  )
  const unsigned = `${header}.${claims}`
  // WebCrypto の ECDSA 署名は r||s（64 バイト）で、JWS の ES256 と同じ形
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signingKey, encoder.encode(unsigned)),
  )
  return `vapid t=${unsigned}.${base64UrlEncode(signature)}, k=${keys.publicKey}`
}

export async function sendPush(target: PushTarget, payload: unknown, keys: VapidKeys): Promise<PushResult> {
  try {
    const body = await encryptPayload(target, encoder.encode(JSON.stringify(payload)))
    const response = await fetch(target.endpoint, {
      method: 'POST',
      headers: {
        Authorization: await vapidAuthorization(target.endpoint, keys),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        // 端末がオフラインでも1日は届け直してもらう
        TTL: String(24 * 60 * 60),
        Urgency: 'normal',
      },
      body,
    })
    if (response.status === 404 || response.status === 410) return 'gone'
    if (!response.ok) {
      console.warn('push service returned', response.status, await response.text())
      return 'failed'
    }
    return 'sent'
  } catch (e) {
    console.warn('push failed', String(e))
    return 'failed'
  }
}
