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
          // 今いる一覧（/posts や /@handle/articles）のまま、ページだけ変える。
          // 1 ページ目はクエリを付けず、正規 URL をクエリなしに揃える
          to="."
          search={page === 1 ? {} : { page }}
          className={
            page === currentPage
              ? 'inline-flex min-h-9 items-center rounded-md border border-accent bg-accent-soft px-3 text-sm text-accent'
              : 'inline-flex min-h-9 items-center rounded-md border border-border px-3 text-sm text-text-muted transition-colors hover:border-accent hover:text-accent'
          }
          aria-current={page === currentPage ? 'page' : undefined}
        >
          {page}
        </Link>
      ))}
    </nav>
  )
}
