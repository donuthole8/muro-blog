type Props = {
  title: React.ReactNode
  description?: React.ReactNode
  /** 見出しの右に置くボタンなど */
  children?: React.ReactNode
}

/**
 * ページの見出し。各画面で h1 の大きさや余白がばらつかないようにする。
 * 1ページに1つだけ置くこと（h1 のため）。
 */
export function PageHeader({ title, description, children }: Props) {
  return (
    <header className="mb-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-xl font-bold">{title}</h1>
        {children}
      </div>
      {description && (
        <p className="mt-1 text-sm text-text-muted">{description}</p>
      )}
    </header>
  )
}

/** ページの中の区切り（ロビーの「新着」など）。h1 とは別の段。 */
export function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-bold text-text-muted">{children}</h2>
}
