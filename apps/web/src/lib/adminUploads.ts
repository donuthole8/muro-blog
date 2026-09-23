import { createServerFn } from '@tanstack/react-start'
import { getUploadsBucket } from './uploads'

const MAX_BYTES = 8 * 1024 * 1024 // 8MB
const ALLOWED_CONTENT_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

export type UploadImageResult =
  { ok: true; url: string } | { ok: false; message: string }

/**
 * 記事本文に貼る画像を R2 に保存する。
 *
 * 他の管理系サーバー関数と同様、Phase 1 では追加の認証を持たない
 * （README 参照。/admin 自体の保護は Phase 2 の Cloudflare Access で行う）。
 */
export const uploadImage = createServerFn({ method: 'POST' })
  .validator((input: { contentType: string; bytes: Uint8Array }) => input)
  .handler(async ({ data }): Promise<UploadImageResult> => {
    const ext = ALLOWED_CONTENT_TYPES[data.contentType]
    if (!ext) {
      return {
        ok: false,
        message: '対応していない画像形式です（PNG / JPEG / GIF / WebP のみ）。',
      }
    }

    if (data.bytes.byteLength > MAX_BYTES) {
      return { ok: false, message: '画像サイズが大きすぎます（8MB まで）。' }
    }

    const key = `${crypto.randomUUID()}.${ext}`

    await getUploadsBucket().put(key, data.bytes, {
      httpMetadata: { contentType: data.contentType },
    })

    return { ok: true, url: `/uploads/${key}` }
  })
