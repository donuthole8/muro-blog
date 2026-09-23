import { Link } from '@tanstack/react-router'
import type { ArchivedPostSummary } from '@blog/api-client'
import { TagChip } from './TagChip'
import { formatDate } from '../lib/format'
import { DEFAULT_EMOJI } from '../lib/emoji'

export function ArchivedPostCard({ post }: { post: ArchivedPostSummary }) {
  return (
    <article className="group flex gap-4 rounded-xl border-b border-border px-3 py-6 -mx-3 transition-colors first:pt-0 last:border-b-0 hover:bg-surface">
      <Link
        to="/posts/$slug"
        params={{ slug: post.slug }}
        aria-hidden
        tabIndex={-1}
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-2xl transition-transform group-hover:scale-105"
      >
        {post.emoji || DEFAULT_EMOJI}
      </Link>

      <div className="min-w-0 flex-1">
        <Link
          to="/posts/$slug"
          params={{ slug: post.slug }}
          className="block text-lg font-bold text-text transition-colors hover:text-accent"
        >
          {post.title}
        </Link>

        {post.excerpt && (
          <p className="mt-2 line-clamp-2 text-sm text-text-muted">
            {post.excerpt}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {post.publishedAt && (
            <time
              dateTime={post.publishedAt}
              className="font-mono text-xs text-text-muted"
            >
              {formatDate(post.publishedAt)}
            </time>
          )}
          {post.tags.map((tag) => (
            <TagChip key={tag.slug} name={tag.name} slug={tag.slug} />
          ))}
        </div>
      </div>
    </article>
  )
}
