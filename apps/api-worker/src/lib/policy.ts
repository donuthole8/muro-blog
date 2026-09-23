/**
 * handle（部屋の URL /@handle になる）に使える文字と予約語。
 *
 * 英小文字・数字・アンダースコアの 3〜20 文字。大文字小文字を区別すると
 * なりすまし（@Alice と @alice）が起きるので、小文字に正規化して保存する。
 */
export const HANDLE_PARTIAL = '[a-zA-Z0-9_]{3,20}(?![a-zA-Z0-9_])'

const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/

/**
 * 運営を装える名前、サービスの URL と紛らわしい名前は取らせない。
 * web のルート名（/search, /og など今後増やすものを含む）もここに足す。
 */
const RESERVED = new Set([
  'about', 'abuse', 'account', 'admin', 'administrator', 'anonymous', 'api', 'app', 'archive',
  'auth', 'block', 'blocks', 'blog', 'callback', 'config', 'contact', 'dashboard', 'deleted',
  'dev', 'explore', 'feed', 'following', 'help', 'home', 'info', 'legal', 'lobby', 'login',
  'logout', 'mail', 'me', 'mod', 'moderation', 'moderator', 'mute', 'mutes', 'new', 'news',
  'notifications', 'null', 'official', 'og', 'org', 'orgs', 'owner', 'posts', 'privacy',
  'report', 'reports', 'rooms', 'root', 'rss', 'search', 'security', 'settings', 'signin',
  'signup', 'staff', 'static', 'status', 'support', 'system', 'tags', 'team', 'terms',
  'teatimes', 'times', 'undefined', 'uploads', 'user', 'users', 'welcome', 'www',
])

/** @returns エラーメッセージ（問題なければ null） */
export function handleViolation(handle: string): string | null {
  if (!HANDLE_PATTERN.test(handle)) {
    return 'handle は英小文字・数字・アンダースコアの 3〜20 文字で指定してください。'
  }
  if (RESERVED.has(handle) || handle.startsWith('admin') || handle.startsWith('official')) {
    return 'この handle は予約されているため使えません。'
  }
  return null
}

export const normalizeHandle = (handle: string) =>
  handle.trim().replace(/^@+/, '').toLowerCase()

/** ルートの {handle} に許す形。 */
export const HANDLE_PARAM = /^[A-Za-z0-9_]{1,32}$/

// ---------- 会社名 ----------

const AFFIXES = [
  '株式会社', '有限会社', '合同会社', '合資会社', '合名会社', '一般社団法人', '一般財団法人',
  '(株)', '（株）', '㈱', '(有)', '（有）', '㈲', '(同)', '（同）',
  'inc.', 'inc', 'co., ltd.', 'co.,ltd.', 'co., ltd', 'co.,ltd', 'co. ltd.', 'co ltd', 'ltd.', 'ltd',
  'llc', 'l.l.c.', 'corp.', 'corp', 'corporation', 'k.k.', 'gmbh',
].map((affix) => affix.normalize('NFKC').toLowerCase())

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * 自己申告の会社名から、同じ会社をまとめるための slug を作る。
 * 「株式会社サンプル」「サンプル Inc.」「(株)サンプル」を同じ slug にする。
 */
export function companySlug(name: string): string | null {
  let s = name.normalize('NFKC').toLowerCase()
  for (const affix of AFFIXES) {
    s = /^[\x20-\x7e]+$/.test(affix)
      ? s.replace(new RegExp(`(?<![a-z0-9])${escapeRegExp(affix)}(?![a-z0-9])`, 'gu'), ' ')
      : s.replaceAll(affix, ' ')
  }
  s = s.replace(/[\s\p{P}\p{S}]+/gu, '')
  return s === '' ? null : [...s].slice(0, 100).join('')
}

// ---------- 絵文字 ----------

const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' })

/** リアクションに使える絵文字（書記素1つで、絵文字であるもの）。 */
export function isValidEmoji(emoji: string): boolean {
  if (emoji === '' || new TextEncoder().encode(emoji).length > 32) return false
  if ([...segmenter.segment(emoji)].length !== 1) return false
  return /^(?:\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]{2})/u.test(emoji)
}
