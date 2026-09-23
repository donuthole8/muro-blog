import { createFileRoute } from '@tanstack/react-router'
import { getUploadsBucket } from '../lib/uploads'

/**
 * R2 に置いた画像を配信する公開エンドポイント。
 *
 * R2 バケット自体は公開URLを持たないため、Worker 側でこのルートを通して
 * 中継する。管理画面のアップロードが返す URL（/uploads/{key}）はここに来る。
 */
export const Route = createFileRoute('/uploads/$key')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const object = await getUploadsBucket().get(params.key)

        if (!object) {
          return new Response('Not Found', { status: 404 })
        }

        const headers = new Headers()
        object.writeHttpMetadata(headers)
        headers.set('etag', object.httpEtag)
        // 画像はアップロード後に上書きしない（キーは毎回ランダム）ので長期キャッシュしてよい
        headers.set('Cache-Control', 'public, max-age=31536000, immutable')

        return new Response(object.body, { headers })
      },
    },
  },
})
