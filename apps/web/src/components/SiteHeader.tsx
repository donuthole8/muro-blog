import { Link } from '@tanstack/react-router'
import { ThemeToggle } from './ThemeToggle'
import { site } from '../lib/site'

const navItems = [
  { to: '/posts', label: '記事' },
  { to: '/tags', label: 'タグ' },
  { to: '/about', label: 'about' },
] as const

export function SiteHeader() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
        <Link
          to="/"
          className="font-mono text-lg font-bold text-text transition-colors hover:text-accent"
        >
          {site.title}
        </Link>

        <nav className="flex flex-1 gap-3 text-sm sm:gap-4">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="text-text-muted transition-colors hover:text-accent"
              activeProps={{ className: 'text-accent' }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <ThemeToggle />
      </div>
    </header>
  )
}
