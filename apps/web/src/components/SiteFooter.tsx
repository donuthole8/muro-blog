import { site } from '../lib/site'

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-xs text-text-muted">
        <span>
          © {new Date().getFullYear()} {site.author}
        </span>
        <a href="/rss.xml" className="transition-colors hover:text-accent">
          RSS
        </a>
      </div>
    </footer>
  )
}
