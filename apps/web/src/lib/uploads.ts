import { env } from 'cloudflare:workers'

/**
 * 投稿に添える画像の置き場（Cloudflare R2）。
 *
 * バインディングはただのオブジェクトなので process.env では表せない。
 * @cloudflare/vite-plugin が実際の Workers ランタイム上で動かしているため、
 * `cloudflare:workers` からバインディングを直接読める
 * （ローカル開発時は wrangler のローカルエミュレーションが使われる）。
 * このモジュールはサーバー側のコード（サーバー関数・サーバールート）からのみ呼ぶこと。
 */
export function getUploadsBucket(): R2Bucket {
  return env.BLOG_IMAGES
}
