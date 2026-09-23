import { Link } from '@tanstack/react-router'

type Props = {
  currentPage: number
  totalPages: number
}

export function Pagination({ currentPage, totalPages }: Props) {
  if (totalPages <= 1) return null

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1)

  return (
    <nav
      className="mt-10 flex flex-wrap items-center justify-center gap-2"
      aria-label="ページ送り"
    >
      {pages.map((page) => (
        <Link
          key={page}
          to="/posts"
          // 1 ページ目はクエリを付けず、正規 URL を /posts に揃える
          search={page === 1 ? {} : { page }}
          className={
            page === currentPage
              ? 'rounded-md border border-accent bg-accent-soft px-3 py-1 text-sm text-accent'
              : 'rounded-md border border-border px-3 py-1 text-sm text-text-muted transition-colors hover:border-accent hover:text-accent'
          }
          aria-current={page === currentPage ? 'page' : undefined}
        >
          {page}
        </Link>
      ))}
    </nav>
  )
}
