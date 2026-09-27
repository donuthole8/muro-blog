import type { TimesPost } from '@blog/api-client'
import { htmlExcerpt } from './format'

export type MuteReason = 'user' | 'word'

/**
 * 投稿がミュートの対象か。公開 API はエッジで共有キャッシュするので、ミュートはブラウザ側で当てる。
 * 語は本文とタグ名（#付き）に対して、大文字・小文字を区別せずに部分一致で見る。自分の投稿は対象にしない。
 */
export function muteReason(
  post: TimesPost,
  mutedHandles: ReadonlySet<string>,
  mutedWords: ReadonlyArray<string>,
  myHandle: string | null | undefined,
): MuteReason | null {
  const handle = post.author?.handle
  if (!handle || handle === myHandle || post.state !== 'visible') return null
  if (mutedHandles.has(handle)) return 'user'
  if (mutedWords.length === 0) return null

  const text = [
    htmlExcerpt(post.bodyHtml, Number.MAX_SAFE_INTEGER),
    ...post.tags.map((tag) => `#${tag.name}`),
  ]
    .join('\n')
    .toLowerCase()
  return mutedWords.some((word) => text.includes(word)) ? 'word' : null
}
