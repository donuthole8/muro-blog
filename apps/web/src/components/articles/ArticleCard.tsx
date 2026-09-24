import type { ArticleCard as ArticleCardData } from '@blog/api-client'
import { ArticleLink } from './ArticleLink'
import { Icon } from '../Icon'
import { DEFAULT_EMOJI } from '../../lib/emoji'

type Props = {
  article: ArticleCardData
  /** 渡すと右上に「外す」ボタンを出す（投稿の入力欄で使う） */
  onRemove?: () => void
}

/** 投稿に添付したブログ記事のカード。 */
export function ArticleCard({ article, onRemove }: Props) {
  return (
    <div className="relative mt-2 max-w-lg">
      <ArticleLink
        article={article}
        className="flex gap-3 rounded-lg border border-border bg-surface p-3 transition-colors hover:border-accent"
      >
        <span
          aria-hidden
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-accent-soft text-2xl"
        >
          {article.emoji || DEFAULT_EMOJI}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-bold text-text-muted">
            記事
            {article.author && (
              <span className="ml-1.5 font-mono font-normal">
                @{article.author.handle}
              </span>
            )}
          </span>
          <span className="block truncate text-sm font-bold text-text">
            {article.title}
          </span>
          {article.excerpt && (
            <span className="mt-0.5 line-clamp-2 block text-xs text-text-muted">
              {article.excerpt}
            </span>
          )}
        </span>
      </ArticleLink>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="記事を外す"
          className="absolute -top-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-text-muted hover:text-accent"
        >
          <Icon name="x" className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
