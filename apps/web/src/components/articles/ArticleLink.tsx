import { Link } from '@tanstack/react-router'

type Props = {
  article: { slug: string; author?: { handle: string } | null }
  className?: string
  children: React.ReactNode
} & Pick<React.HTMLAttributes<HTMLAnchorElement>, 'aria-hidden' | 'tabIndex'>

/**
 * 記事へのリンク。ユーザーの記事は /@handle/articles/:slug、
 * 書き手のいない旧ブログの記事は /posts/:slug（lib/site.ts の articlePath と同じ規則）。
 */
export function ArticleLink({ article, children, ...props }: Props) {
  const handle = article.author?.handle

  return handle ? (
    <Link
      to="/@{$handle}/articles/$slug"
      params={{ handle, slug: article.slug }}
      {...props}
    >
      {children}
    </Link>
  ) : (
    <Link to="/posts/$slug" params={{ slug: article.slug }} {...props}>
      {children}
    </Link>
  )
}
