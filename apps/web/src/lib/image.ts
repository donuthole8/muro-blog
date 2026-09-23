/**
 * 投稿に添える画像をブラウザ側で縮小・再エンコードする。
 *
 * Worker には画像処理のライブラリを載せられない（sharp 等はネイティブ依存）ため、
 * 投稿時にブラウザの canvas で長辺を縮め、WebP（非対応なら JPEG）にしてから送る。
 * R2 の無料枠（10GB）と転送量を節約する目的もある。
 */
const MAX_EDGE = 2048
const QUALITY = 0.85
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024

export async function prepareImage(
  file: File,
): Promise<{ blob: Blob; contentType: string }> {
  // GIF はアニメーションが canvas で潰れるので、そのまま送る（サイズ上限だけ見る）
  if (file.type === 'image/gif') {
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error('GIF は 2MB までです。')
    }
    return { blob: file, contentType: file.type }
  }

  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('画像を処理できませんでした。')
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  // Safari は WebP でのエンコードに対応しておらず PNG で返してくるので、そのときは JPEG にする
  let blob = await toBlob(canvas, 'image/webp')
  if (blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg')

  if (blob.size > MAX_UPLOAD_BYTES) {
    throw new Error('画像が大きすぎます。')
  }

  return { blob, contentType: blob.type }
}

function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error('画像を変換できませんでした。')),
      type,
      QUALITY,
    )
  })
}

export function imageUrl(key: string): string {
  return `/uploads/${key}`
}
