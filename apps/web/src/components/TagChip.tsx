import { Link } from '@tanstack/react-router'

type Props = {
  name: string
  slug: string
  count?: number
  /**
   * 投稿の中に並べるときの控えめな形。枠を外して背景だけにし、
   * 枠付きのリアクションボタンと見分けがつくようにする。
   */
  compact?: boolean
}

export function TagChip({ name, slug, count, compact = false }: Props) {
  return (
    <Link
      to="/tags/$slug"
      params={{ slug }}
      className={
        compact
          ? 'inline-flex min-h-6 items-center gap-0.5 rounded-md bg-code-bg px-1.5 text-xs text-text-muted transition-colors hover:text-accent'
          : 'inline-flex min-h-8 items-center gap-1 rounded-full border border-border px-2.5 text-xs text-text-muted transition-colors hover:border-accent hover:text-accent'
      }
    >
      <span aria-hidden="true">#</span>
      {name}
      {count !== undefined && (
        <span className="text-[0.7rem] opacity-70">{count}</span>
      )}
    </Link>
  )
}
