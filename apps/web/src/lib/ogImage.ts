import { uploadPostImage } from './account'
import { DEFAULT_EMOJI } from './emoji'
import { site } from './site'

/**
 * 記事の共有カード画像（OGP・1200×630）を、書き手のブラウザの canvas で描く。
 *
 * Worker の無料枠では日本語フォント込みの画像生成が収まらないので、公開・更新のときに
 * ブラウザで描いて投稿の画像と同じ置き場（KV）に上げ、記事にキーを紐付ける。
 * 見た目は旧ブログの記事の画像（scripts/generate-og-images.mjs）に揃える。
 */
const WIDTH = 1200
const HEIGHT = 630
const SANS =
  "system-ui, -apple-system, 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', Meiryo, sans-serif"
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

export type OgCard = {
  title: string
  emoji: string | null
  tags: Array<string>
  handle: string
}

/** 画像に出る内容が変わったか（変わっていなければ描き直さない）。 */
export function ogCardKey(card: OgCard) {
  return JSON.stringify([card.title.trim(), card.emoji, card.tags, card.handle])
}

async function renderOgImage(card: OgCard): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('画像を描けませんでした。')

  const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT)
  bg.addColorStop(0, '#1c2b57')
  bg.addColorStop(1, '#3557d6')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  // 絵文字のタイル
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  ctx.beginPath()
  ctx.roundRect(80, 64, 128, 128, 28)
  ctx.fill()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `72px ${SANS}`
  ctx.fillText(card.emoji || DEFAULT_EMOJI, 144, 132)

  // タイトル（幅に合わせて最大3行で折り返す）
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#ffffff'
  ctx.font = `700 60px ${SANS}`
  wrap(ctx, card.title.trim(), WIDTH - 160, 3).forEach((line, i) => {
    ctx.fillText(line, 80, 290 + i * 80)
  })

  ctx.font = `28px ${MONO}`
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  const tags = card.tags.map((tag) => `#${tag}`).join('  ')
  if (tags) ctx.fillText(tags, 80, HEIGHT - 76, WIDTH - 160)

  ctx.font = `700 26px ${MONO}`
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.fillText(`@${card.handle} · ${site.title}`, 80, HEIGHT - 36)

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('画像を描けませんでした。')),
      'image/jpeg',
      0.88,
    ),
  )
}

/** 1文字ずつ幅を測って折り返す（日本語は単語の区切りがないので）。 */
function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): Array<string> {
  const lines: Array<string> = []
  let current = ''
  for (const ch of Array.from(text)) {
    if (current !== '' && ctx.measureText(current + ch).width > maxWidth) {
      lines.push(current)
      current = ''
      if (lines.length === maxLines) {
        lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, -1)}…`
        return lines
      }
    }
    current += ch
  }
  if (current) lines.push(current)
  return lines
}

/**
 * 共有カード画像を描いてアップロードし、キーを返す。
 * 失敗しても記事の保存は止めない（null を返し、呼び出し側は今の画像のままにする）。
 */
export async function uploadOgImage(card: OgCard): Promise<string | null> {
  try {
    const blob = await renderOgImage(card)
    const result = await uploadPostImage({
      data: {
        contentType: 'image/jpeg',
        bytes: new Uint8Array(await blob.arrayBuffer()),
      },
    })
    return result.ok ? result.key : null
  } catch {
    return null
  }
}
