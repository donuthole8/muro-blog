/**
 * 投稿に添える画像をブラウザ側で縮小・再エンコードする。
 *
 * Worker には画像処理のライブラリを載せられない（sharp 等はネイティブ依存）ため、
 * 投稿時にブラウザの canvas で長辺を縮め、WebP（非対応なら JPEG）にしてから送る。
 * 置き場の Workers KV は無料枠が 1GB なので、1枚あたり TARGET_BYTES に収まるまで
 * 画質 → 解像度の順に段階的に落とす（写真で「大きすぎます」にならないように）。
 */
const MAX_EDGE = 1600
/** 縮小の目標。これを下回った時点で止める */
const TARGET_BYTES = 500 * 1024
/** 試す組み合わせ（長辺・画質）。前から順に、目標を下回るまで試す */
const ATTEMPTS: Array<{ edge: number; quality: number }> = [
  { edge: MAX_EDGE, quality: 0.85 },
  { edge: MAX_EDGE, quality: 0.72 },
  { edge: 1280, quality: 0.72 },
  { edge: 1024, quality: 0.68 },
  { edge: 800, quality: 0.62 },
]
/** サーバーが受け付ける上限（lib/account.ts の MAX_IMAGE_BYTES と揃える） */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024

export async function prepareImage(
  file: File,
): Promise<{ blob: Blob; contentType: string }> {
  // GIF はアニメーションが canvas で潰れるので、そのまま送る（サイズ上限だけ見る）
  if (file.type === 'image/gif') {
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error(
        'GIF は 2MB までです（アニメーションを保つため縮小できません）。',
      )
    }
    return { blob: file, contentType: file.type }
  }

  const bitmap = await createImageBitmap(file)
  try {
    let smallest: Blob | null = null
    for (const { edge, quality } of ATTEMPTS) {
      const blob = await encode(bitmap, edge, quality)
      if (!smallest || blob.size < smallest.size) smallest = blob
      if (blob.size <= TARGET_BYTES) break
    }
    if (!smallest || smallest.size > MAX_UPLOAD_BYTES) {
      throw new Error('画像が大きすぎます。')
    }
    return { blob: smallest, contentType: smallest.type }
  } finally {
    bitmap.close()
  }
}

async function encode(
  bitmap: ImageBitmap,
  maxEdge: number,
  quality: number,
): Promise<Blob> {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('画像を処理できませんでした。')
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

  // Safari は WebP でのエンコードに対応しておらず PNG で返してくるので、そのときは JPEG にする
  const blob = await toBlob(canvas, 'image/webp', quality)
  return blob.type === 'image/webp'
    ? blob
    : toBlob(canvas, 'image/jpeg', quality)
}

function toBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error('画像を変換できませんでした。')),
      type,
      quality,
    )
  })
}

export function imageUrl(key: string): string {
  return `/uploads/${key}`
}
