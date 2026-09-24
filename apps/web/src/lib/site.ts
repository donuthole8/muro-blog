/**
 * サイト全体の設定。
 * サービス名・ドメインは未確定なので、決まったらここだけ直せばよい。
 */
export const site = {
  title: 'teatimes',
  description:
    '自分だけの times（分報）を持てる場所。独り言を書き、人の部屋に遊びに行ってスレッドで話す。',
  /** 旧ブログ（アーカイブ）の書き手。フッターと RSS に使う。 */
  author: 'm-muronaga',
  /** 本番の公開 URL。RSS・サイトマップ・OGP の絶対 URL に使う。 */
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- apps/web/src/lib/api.ts と同じ理由
  url: process.env.SITE_URL ?? 'http://localhost:3000',
  /**
   * 既定の OGP 画像。アーカイブ記事は `scripts/generate-og-images.mjs` が
   * ビルド時に `/og/{slug}.png` を生成し、そちらを使う（posts.$slug.tsx 参照）。
   */
  ogImage: '/og-image.png',
} as const

/** ログイン画面（メールアドレス / Google を選ぶ）へ。ログイン後は returnTo に戻る。 */
export function loginUrl(returnTo?: string) {
  return returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : '/login'
}

/** Google の同意画面へ。ログイン後は returnTo に戻る。 */
export function googleLoginUrl(returnTo?: string) {
  return returnTo
    ? `/auth/google?returnTo=${encodeURIComponent(returnTo)}`
    : '/auth/google'
}

/** 部屋のチャンネル名。Slack の times に合わせて `times_{handle}` と呼ぶ（URL は /@handle のまま）。 */
export function roomName(handle: string) {
  return `times_${handle}`
}

/** 外部サイトへのオープンリダイレクトにならないよう、サイト内のパスだけを許す。 */
export function safeReturnTo(value: string | null | undefined): string {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.startsWith('/\\')
  ) {
    return '/'
  }
  return value
}

/** 記事の公開 URL のパス。書き手のいない記事は旧ブログの記事（/posts/:slug）。 */
export function articlePath(article: {
  slug: string
  author?: { handle: string } | null
}) {
  return article.author
    ? `/@${article.author.handle}/articles/${article.slug}`
    : `/posts/${article.slug}`
}
