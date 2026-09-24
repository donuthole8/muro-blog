import { Link } from '@tanstack/react-router'
import type { ArchivedPostDetail } from '@blog/api-client'
import { TagChip } from '../TagChip'
import { TableOfContents } from '../TableOfContents'
import { Avatar } from '../times/Avatar'
import { useMe } from '../../lib/queries'
import { formatDate, estimateReadingMinutes } from '../../lib/format'
import { DEFAULT_EMOJI } from '../../lib/emoji'
import { extractToc } from '../../lib/toc'

/** 記事の本文ページ（旧ブログの記事とユーザーの記事で共通）。 */
export function ArticleView({ post }: { post: ArchivedPostDetail }) {
  const me = useMe()
  const author = post.author
  const isMine = author != null && me?.handle === author.handle

  return (
    <article>
      <header className="border-b border-border pb-6">
        <div
          aria-hidden
          className="mb-5 flex h-24 w-24 items-center justify-center rounded-2xl bg-accent-soft text-5xl"
        >
          {post.emoji || DEFAULT_EMOJI}
        </div>

        <h1 className="text-2xl leading-relaxed font-bold">{post.title}</h1>

        {author && (
          <div className="mt-4 flex items-center gap-2 text-sm">
            <Link
              to="/@{$handle}"
              params={{ handle: author.handle }}
              className="flex items-center gap-2 hover:text-accent"
            >
              <Avatar user={author} size="xs" />
              <span className="font-bold">{author.displayName}</span>
              <span className="font-mono text-xs text-text-muted">
                @{author.handle}
              </span>
            </Link>
            {isMine && (
              <Link
                to="/articles/$id/edit"
                params={{ id: String(post.id) }}
                className="ml-auto text-xs text-text-muted hover:text-accent"
              >
                編集する
              </Link>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {post.publishedAt && (
            <time
              dateTime={post.publishedAt}
              className="font-mono text-xs text-text-muted"
            >
              {formatDate(post.publishedAt)}
            </time>
          )}
          <span className="font-mono text-xs text-text-muted">
            ・約{estimateReadingMinutes(post.bodyHtml)}分
          </span>
          {post.tags.map((tag) => (
            <TagChip key={tag.slug} name={tag.name} slug={tag.slug} />
          ))}
        </div>
      </header>

      <TableOfContents items={extractToc(post.bodyHtml)} />

      {/*
        旧ブログの記事の bodyHtml は、書けるのが管理者本人だけだった時代に変換済みのもの。
        ユーザーの記事は API 側で生 HTML をエスケープして変換している（api-worker の lib/markdown.ts）。
      */}
      <div
        className="prose prose-blog mt-8 max-w-none"
        dangerouslySetInnerHTML={{ __html: post.bodyHtml }}
      />
    </article>
  )
}
