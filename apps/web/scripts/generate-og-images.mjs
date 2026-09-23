#!/usr/bin/env node
/**
 * 記事ごとの OGP 画像をビルド時に静的生成する。
 *
 * Cloud Run はコールドスタートするため、読者アクセス時にオンデマンド生成する
 * 設計にはせず、`pnpm build` の一部として一度だけ作って `public/og/` に置く。
 * public/ の中身はそのまま dist/client/ にコピーされる（vite の既定挙動）。
 *
 * 実行には Symfony API が起動している必要がある
 * （prerender 自体がすでにその前提を置いている。README 参照）。
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

loadDotEnv(path.join(root, '.env'))

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://127.0.0.1:8000'
// apps/web/src/lib/site.ts と表記を揃えること
const SITE_TITLE = 'blog'

const OUT_DIR = path.join(root, 'public', 'og')
const WIDTH = 1200
const HEIGHT = 630

async function main() {
  const posts = await fetchAllPublishedPosts()

  rmSync(OUT_DIR, { recursive: true, force: true })
  mkdirSync(OUT_DIR, { recursive: true })

  for (const post of posts) {
    const svg = buildOgSvg(post)
    const png = new Resvg(svg, {
      fitTo: { mode: 'width', value: WIDTH },
      font: { loadSystemFonts: true },
    })
      .render()
      .asPng()

    writeFileSync(path.join(OUT_DIR, `${post.slug}.png`), png)
  }

  console.log(`[og] ${posts.length} 件の OGP 画像を生成しました → public/og/`)
}

async function fetchAllPublishedPosts() {
  const perPage = 50
  const posts = []
  let page = 1
  let totalPages = 1

  do {
    const res = await fetch(
      `${API_BASE_URL}/api/posts?page=${page}&perPage=${perPage}`,
    )
    if (!res.ok) {
      throw new Error(
        `記事一覧の取得に失敗しました（${res.status}）。Symfony API は起動していますか？`,
      )
    }

    const body = await res.json()
    posts.push(...body.items)
    totalPages = body.totalPages
    page += 1
  } while (page <= totalPages)

  return posts
}

function buildOgSvg(post) {
  const titleLines = wrapTitle(post.title, 15, 3)
  const tagsText = post.tags.map((tag) => `#${tag.name}`).join('  ')

  const titleTspans = titleLines
    .map(
      (line, i) =>
        `<tspan x="80" dy="${i === 0 ? 0 : 84}">${escapeXml(line)}</tspan>`,
    )
    .join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="${WIDTH}" y2="${HEIGHT}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#1c2b57"/>
      <stop offset="1" stop-color="#3557d6"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>

  <rect x="80" y="72" width="112" height="112" rx="28" fill="rgba(255,255,255,0.12)"/>
  <text
    x="136"
    y="146"
    text-anchor="middle"
    dominant-baseline="central"
    font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    font-size="52"
    font-weight="700"
    fill="#ffffff"
  >&gt;_</text>

  <text
    font-family="system-ui, -apple-system, 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', Meiryo, sans-serif"
    font-size="64"
    font-weight="700"
    fill="#ffffff"
    y="260"
  >${titleTspans}</text>

  ${
    tagsText
      ? `<text x="80" y="${HEIGHT - 70}" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="28" fill="rgba(255,255,255,0.75)">${escapeXml(tagsText)}</text>`
      : ''
  }

  <text
    x="80"
    y="${HEIGHT - 32}"
    font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    font-size="26"
    font-weight="700"
    fill="rgba(255,255,255,0.55)"
  >${escapeXml(SITE_TITLE)}</text>
</svg>`
}

/** 日本語（全角）は1文字、英数字は0.55文字分の幅として折り返す簡易実装 */
function wrapTitle(title, maxWeightPerLine, maxLines) {
  const chars = Array.from(title)
  const lines = []
  let current = ''
  let weight = 0
  let truncated = false

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]
    const w = isWideChar(ch) ? 1 : 0.55

    if (weight + w > maxWeightPerLine && current) {
      lines.push(current)
      current = ''
      weight = 0

      if (lines.length === maxLines) {
        truncated = i < chars.length - 1
        break
      }
    }

    current += ch
    weight += w
  }

  if (lines.length < maxLines && current) {
    lines.push(current)
  }

  if (truncated && lines.length > 0) {
    lines[lines.length - 1] = lines[lines.length - 1].slice(0, -1) + '…'
  }

  return lines
}

function isWideChar(ch) {
  const code = ch.codePointAt(0)
  return (
    (code >= 0x3000 && code <= 0x30ff) ||
    (code >= 0x3400 && code <= 0x9fff) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xff00 && code <= 0xffef)
  )
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return

  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const eq = trimmed.indexOf('=')
    if (eq === -1) continue

    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    process.env[key] ??= value
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
