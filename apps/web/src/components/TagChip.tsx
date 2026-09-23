import { Link } from '@tanstack/react-router'

type Props = {
  name: string
  slug: string
  count?: number
}

export function TagChip({ name, slug, count }: Props) {
  return (
    <Link
      to="/tags/$slug"
      params={{ slug }}
      className="inline-flex min-h-8 items-center gap-1 rounded-full border border-border px-2.5 text-xs text-text-muted transition-colors hover:border-accent hover:text-accent"
    >
      <span aria-hidden="true">#</span>
      {name}
      {count !== undefined && (
        <span className="text-[0.7rem] opacity-70">{count}</span>
      )}
    </Link>
  )
}
