type Props = {
  /** 状況を表す絵文字。装飾なので読み上げからは外す */
  icon?: string
  title: React.ReactNode
  description?: React.ReactNode
  /** 次にやることへの導線（リンクやボタン） */
  action?: React.ReactNode
}

/**
 * 空の一覧。素の1行で済ませると迷子になるので、
 * 何が無いのかと、次に何をすればいいのかを一緒に出す。
 */
export function EmptyState({ icon, title, description, action }: Props) {
  return (
    <div className="px-5 py-12 text-center">
      {icon && (
        <p aria-hidden className="text-3xl opacity-60">
          {icon}
        </p>
      )}
      <p className="mt-3 text-sm font-bold">{title}</p>
      {description && (
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-text-muted">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
