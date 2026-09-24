import { Link } from '@tanstack/react-router'
import { site } from '../lib/site'

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-6 sm:px-5 text-xs text-text-muted">
        <span>
          © {new Date().getFullYear()} {site.author}
        </span>
        <nav className="flex flex-wrap gap-4">
          <Link to="/about" className="transition-colors hover:text-accent">
            {site.title} について
          </Link>
          <Link to="/posts" className="transition-colors hover:text-accent">
            ブログ
          </Link>
        </nav>
      </div>
    </footer>
  )
}
