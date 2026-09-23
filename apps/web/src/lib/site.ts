/**
 * サイト全体の設定。
 * プロジェクト名・ドメインは未確定なので、決まったらここだけ直せばよい。
 */
export const site = {
  title: 'blog',
  description: 'Web 開発について書いています。',
  author: 'm-muronaga',
  /** 本番の公開 URL。RSS とサイトマップの絶対 URL に使う。 */
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- apps/web/src/lib/api.ts と同じ理由
  url: process.env.SITE_URL ?? 'http://localhost:3000',
  /**
   * トップ・タグ一覧など記事以外のページで使う既定の OGP 画像。
   * 記事詳細ページは `scripts/generate-og-images.mjs` がビルド時に
   * `/og/{slug}.png` を生成し、そちらを使う（posts.$slug.tsx 参照）。
   */
  ogImage: '/og-image.png',
} as const
