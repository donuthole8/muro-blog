/**
 * パスワードのハッシュ化（PBKDF2-SHA256）。
 *
 * Workers の WebCrypto だけで完結させるため bcrypt / argon2 ではなく PBKDF2 を使う。
 * 反復回数は Workers の上限（100,000）に合わせる。
 * 保存形式は `pbkdf2-sha256$<反復回数>$<salt(base64)>$<hash(base64)>`。
 * 反復回数を上げたくなっても、形式に含めてあるので既存のハッシュはそのまま検証できる。
 */
const ALGORITHM = 'pbkdf2-sha256'
const ITERATIONS = 100_000
const SALT_BYTES = 16
const HASH_BITS = 256

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    HASH_BITS,
  )
  return new Uint8Array(bits)
}

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const fromBase64 = (value: string) => Uint8Array.from(atob(value), (ch) => ch.charCodeAt(0))

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const hash = await derive(password, salt, ITERATIONS)
  return [ALGORITHM, ITERATIONS, toBase64(salt), toBase64(hash)].join('$')
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, iterations, salt, hash] = stored.split('$')
  if (algorithm !== ALGORITHM || !iterations || !salt || !hash) return false

  const expected = fromBase64(hash)
  const actual = await derive(password, fromBase64(salt), Number(iterations))
  if (actual.length !== expected.length) return false

  // 比較にかかる時間から一致した長さを推測されないよう、途中で抜けずに全部比べる
  let diff = 0
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i]
  return diff === 0
}

/**
 * アドレスが存在しないときも同じくらい時間をかけ、応答時間から登録済みかどうかを
 * 見分けられないようにするためのダミー。
 */
export async function burnPasswordCheck(password: string) {
  await derive(password, new Uint8Array(SALT_BYTES), ITERATIONS)
}
