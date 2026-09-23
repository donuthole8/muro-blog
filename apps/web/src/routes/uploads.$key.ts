import { createFileRoute } from '@tanstack/react-router'
import { getImage } from '../lib/uploads'

/**
 * KV に置いた画像を配信する公開エンドポイント。
 *
 * KV は公開 URL を持たないため、Worker 側でこのルートを通して中継する。
 * アップロードが返す URL（/uploads/{key}）はここに来る。
 */
export const Route = createFileRoute('/uploads/$key')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const image = await getImage(params.key)

        if (!image) {
          return new Response('Not Found', { status: 404 })
        }

        const headers = new Headers({ 'Content-Type': image.contentType })
        // キーは毎回ランダムで上書きしないので、キーそのものを ETag にできる
        headers.set('etag', `"${params.key}"`)
        // 画像はアップロード後に上書きしない（キーは毎回ランダム）ので長期キャッシュしてよい
        headers.set('Cache-Control', 'public, max-age=31536000, immutable')

        return new Response(image.body, { headers })
      },
    },
  },
})
