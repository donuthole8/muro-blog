/**
 * 独立行に貼っただけの裸 URL（`<p><a href="X">X</a></p>`）を、OGP 情報つきのリンクカードに差し替える。
 *
 * 他人のサーバーへの通信（最大数秒）を投稿の待ち時間に含めないため、投稿の保存後に
 * ctx.waitUntil で埋める。取得に失敗したものは .bare-link を振った裸リンクのまま残し、
 * 表示はフロントの CSS がカード風にフォールバックする。
 */

type LinkCard = {
  url: string
  title: string
  description: string | null
  image: string | null
  siteName: string
  favicon: string | null
}

const TIMEOUT_MS = 4000
const MAX_BODY_BYTES = 512 * 1024
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 7

const BARE_LINK = /<p><a ([^>]*?)href="([^"]+)"([^>]*)>([^<]*)<\/a><\/p>/g

export function hasBareLink(html: string): boolean {
  for (const m of html.matchAll(BARE_LINK)) {
    if (isSelfLabeled(m[2], m[4])) return true
  }
  return false
}

/** リンクの文字列が URL そのもの（Markdown の自動リンク）か。 */
function isSelfLabeled(href: string, text: string): boolean {
  const label = text.trim()
  return href !== '' && (label === href || label === href.replace(/\/$/, ''))
}

export async function embedLinkCards(html: string): Promise<string> {
  const matches = [...html.matchAll(BARE_LINK)].filter((m) => isSelfLabeled(m[2], m[4]))
  if (matches.length === 0) return html

  const cards = await Promise.all(matches.map((m) => fetchLinkCard(decodeAttr(m[2]))))

  let result = ''
  let last = 0
  matches.forEach((m, i) => {
    const [whole, before, href, after, text] = m
    const start = m.index
    result += html.slice(last, start)
    const card = cards[i]
    result += card
      ? renderCard(card)
      : `<p><a ${addClass(before)}href="${href}"${after}>${text}</a></p>`
    last = start + whole.length
  })
  return result + html.slice(last)
}

/**
 * OGP が取れなかった裸 URL。CSS 側は「p の唯一の子が a」という構造セレクタだと
 * 文中の [text](url) まで拾ってしまうため、ここで明示的にクラスを振って対象を確定させる。
 */
function addClass(attrs: string): string {
  return /class="/.test(attrs)
    ? attrs.replace(/class="([^"]*)"/, (_, c: string) => `class="${`${c} bare-link`.trim()}"`)
    : `${attrs}class="bare-link" `
}

// ---------- 取得 ----------

async function fetchLinkCard(url: string): Promise<LinkCard | null> {
  if (!isFetchable(url)) return null

  // 同じ URL を何度も取りに行かないよう、エッジのキャッシュに1週間置く
  // （Cache API は独自ドメインのゾーンでだけ効く。workers.dev では毎回取りに行く）
  const cacheKey = new Request(`https://link-card.cache/${encodeURIComponent(url)}`)
  const cache = (caches as unknown as { default: Cache }).default
  const cached = await cache.match(cacheKey)
  if (cached) return (await cached.json()) as LinkCard | null

  const card = await doFetch(url)
  await cache.put(
    cacheKey,
    new Response(JSON.stringify(card), {
      headers: { 'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}` },
    }),
  )
  return card
}

async function doFetch(url: string): Promise<LinkCard | null> {
  let response: Response
  try {
    response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; blog-link-card/1.0; +link preview bot)',
        Accept: 'text/html',
      },
    })
  } catch (e) {
    console.info('link card fetch failed', url, String(e))
    return null
  }
  if (!response.ok || !(response.headers.get('Content-Type') ?? '').includes('text/html')) {
    await response.body?.cancel()
    return null
  }

  const meta: Record<string, string> = {}
  let title = ''
  let inTitle = false

  const rewriter = new HTMLRewriter()
    .on('meta', {
      element(el) {
        const key = el.getAttribute('property') ?? el.getAttribute('name')
        const content = el.getAttribute('content')
        if (key && content !== null && !(key in meta)) meta[key.toLowerCase()] = content
      },
    })
    .on('title', {
      element() {
        inTitle = title === ''
      },
      text(chunk) {
        if (inTitle) title += chunk.text
        if (chunk.lastInTextNode) inTitle = false
      },
    })

  try {
    await rewriter.transform(new Response(limitBytes(response.body, MAX_BODY_BYTES))).arrayBuffer()
  } catch (e) {
    console.info('link card parse failed', url, String(e))
    return null
  }

  const ogTitle = (meta['og:title'] ?? decodeAttr(title)).trim()
  // タイトルが取れないページはカード化する価値が薄いので諦める
  if (ogTitle === '') return null

  const host = new URL(url).host
  const description = (meta['og:description'] ?? meta['description'] ?? '').trim()
  const siteName = (meta['og:site_name'] ?? '').trim()

  return {
    url,
    title: ogTitle,
    description: description === '' ? null : description,
    image: meta['og:image'] ? resolveUrl(meta['og:image'], url) : null,
    siteName: siteName === '' ? host : siteName,
    favicon: resolveUrl('/favicon.ico', url),
  }
}

function limitBytes(body: ReadableStream<Uint8Array> | null, max: number) {
  if (!body) return null
  let total = 0
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        if (total >= max) return
        total += chunk.byteLength
        controller.enqueue(chunk)
        if (total >= max) controller.terminate()
      },
    }),
  )
}

function resolveUrl(maybeRelative: string, base: string): string | null {
  try {
    return new URL(maybeRelative, base).toString()
  } catch {
    return null
  }
}

/**
 * http(s) の公開 URL だけを許可する。
 * Workers からの fetch はそもそも社内ネットワークやメタデータエンドポイントに届かないが、
 * 明らかな内部向けのホスト名と IP リテラルは念のため弾く。
 */
function isFetchable(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
  const host = parsed.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false
  if (/^[\d.]+$/.test(host) || host.startsWith('[')) return false
  return true
}

// ---------- HTML ----------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function decodeAttr(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function renderCard(card: LinkCard): string {
  const img = (src: string, cls: string) =>
    `<img src="${escapeHtml(src)}" alt="" loading="lazy" class="${cls}" onerror="this.style.display='none'">`

  return (
    // 外部サイトへのカード。times の投稿は第三者が書くので、評価を渡さず別タブで開く
    `<a href="${escapeHtml(card.url)}" class="link-card" rel="nofollow ugc noopener noreferrer" target="_blank">` +
    '<span class="link-card-body">' +
    `<span class="link-card-title">${escapeHtml(card.title)}</span>` +
    (card.description ? `<span class="link-card-desc">${escapeHtml(card.description)}</span>` : '') +
    '<span class="link-card-meta">' +
    (card.favicon ? img(card.favicon, 'link-card-favicon') : '') +
    `<span class="link-card-domain">${escapeHtml(card.siteName)}</span>` +
    '</span></span>' +
    (card.image ? img(card.image, 'link-card-thumb') : '') +
    '</a>'
  )
}
