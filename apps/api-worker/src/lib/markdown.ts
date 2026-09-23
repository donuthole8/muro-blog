import MarkdownIt from 'markdown-it'
import { HANDLE_PARTIAL } from './policy'

/**
 * times の投稿の Markdown を HTML に変換する。
 *
 * 誰でも投稿できるので生 HTML は通さない（html: false でエスケープされる）。
 * javascript: などの危険なリンクは markdown-it の validateLink が弾く。
 * フロントはこの HTML をそのまま挿入する。
 */

const MENTION_AT = new RegExp(`^@(${HANDLE_PARTIAL})`)

export type RenderedBody = {
  html: string
  /** 本文でリンクになった @handle（メンション通知の宛先） */
  mentionedHandles: string[]
}

/** 本文中の @handle の候補（実在するかは呼び出し側が DB で確かめる）。 */
export function mentionCandidates(markdown: string): string[] {
  const pattern = new RegExp(`(?<![\\w@])@(${HANDLE_PARTIAL})`, 'gi')
  const handles = [...markdown.matchAll(pattern)].map((m) => m[1].toLowerCase())
  return [...new Set(handles)].slice(0, 20)
}

type Env = { knownHandles: Set<string>; linked: Set<string> }

function createRenderer(siteHost: string) {
  const md = new MarkdownIt('default', {
    html: false,
    linkify: true,
    breaks: false,
    maxNesting: 20,
  })
  // 「example.com」のようなスキームなしの文字列までリンクにしない（GFM の自動リンクに寄せる）
  md.linkify.set({ fuzzyLink: false, fuzzyEmail: false })

  // @handle を部屋へのリンクにする。実在するユーザーだけをリンクにし、リンクにした handle を控える
  md.inline.ruler.after('emphasis', 'mention', (state, silent) => {
    // リンクの文字列の中（[@alice](...)）はそのまま
    const linkLevel = (state as { linkLevel?: number }).linkLevel ?? 0
    if (state.src.charCodeAt(state.pos) !== 0x40 /* @ */ || linkLevel > 0) return false
    const prev = state.pos > 0 ? state.src[state.pos - 1] : ''
    if (/[\w@]/.test(prev)) return false

    const match = MENTION_AT.exec(state.src.slice(state.pos))
    if (!match) return false
    const handle = match[1].toLowerCase()
    const env = state.env as Env
    if (!env.knownHandles.has(handle)) return false

    if (!silent) {
      env.linked.add(handle)
      const open = state.push('link_open', 'a', 1)
      open.attrs = [
        ['href', `/@${handle}`],
        ['class', 'mention'],
      ]
      const text = state.push('text', '', 0)
      text.content = match[0]
      state.push('link_close', 'a', -1)
    }
    state.pos += match[0].length
    return true
  })

  // 外部リンクは別タブで開き、評価を渡さない（第三者が書く本文なので）
  md.core.ruler.push('external_links', (state) => {
    for (const block of state.tokens) {
      for (const token of block.children ?? []) {
        if (token.type !== 'link_open') continue
        if (isExternal(String(token.attrGet('href') ?? ''), siteHost)) {
          token.attrSet('target', '_blank')
          token.attrSet('rel', 'noopener nofollow noreferrer')
        }
      }
    }
  })

  return md
}

function isExternal(href: string, siteHost: string): boolean {
  try {
    const url = new URL(href)
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname !== siteHost
  } catch {
    return false
  }
}

const renderers = new Map<string, ReturnType<typeof createRenderer>>()

export function renderPostBody(markdown: string, knownHandles: string[], siteHost: string): RenderedBody {
  let md = renderers.get(siteHost)
  if (!md) {
    md = createRenderer(siteHost)
    renderers.set(siteHost, md)
  }
  const env: Env = { knownHandles: new Set(knownHandles), linked: new Set() }
  const html = md.render(markdown, env)
  return { html, mentionedHandles: [...env.linked] }
}
