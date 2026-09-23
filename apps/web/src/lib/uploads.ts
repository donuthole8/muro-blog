import { env } from 'cloudflare:workers'

/**
 * 投稿に添える画像の置き場（Workers KV）。
 *
 * R2 は有効化にカード登録が要るため KV に置いている。値は画像のバイト列、
 * Content-Type はメタデータに持つ。キーは毎回ランダムで、上書きはしない。
 *
 * バインディングはただのオブジェクトなので process.env では表せない。
 * @cloudflare/vite-plugin が実際の Workers ランタイム上で動かしているため、
 * `cloudflare:workers` からバインディングを直接読める
 * （ローカル開発時は wrangler のローカルエミュレーションが使われる）。
 * このモジュールはサーバー側のコード（サーバー関数・サーバールート）からのみ呼ぶこと。
 */
type ImageMetadata = { contentType: string }

export async function putImage(
  key: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  await env.BLOG_IMAGES.put(key, bytes, {
    metadata: { contentType } satisfies ImageMetadata,
  })
}

export async function getImage(
  key: string,
): Promise<{ body: ReadableStream; contentType: string } | null> {
  const { value, metadata } =
    await env.BLOG_IMAGES.getWithMetadata<ImageMetadata>(key, 'stream')
  if (!value) return null
  return {
    body: value,
    contentType: metadata?.contentType ?? 'application/octet-stream',
  }
}

/** 画像が消せなくても呼び出し元の処理（投稿の削除など）は成立させる。孤児は後で掃除できる。 */
export async function deleteImages(keys: Array<string>): Promise<void> {
  await Promise.all(
    keys.map((key) => env.BLOG_IMAGES.delete(key).catch(() => undefined)),
  )
}
