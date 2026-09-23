type Props = {
  user: { displayName: string; avatarUrl?: string | null } | null | undefined
  size?: 'xs' | 'sm' | 'md' | 'lg'
}

const sizes = {
  /* ログ行用。時刻カラムが主役なので、アイコンは従属的な大きさにする */
  xs: 'h-6 w-6 text-[0.6rem]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-16 w-16 text-xl',
}

/** Google のアイコン。無ければ表示名の頭文字。 */
export function Avatar({ user, size = 'md' }: Props) {
  const className = `${sizes[size]} shrink-0 rounded-full bg-accent-soft object-cover`

  if (user?.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt=""
        className={className}
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    )
  }

  return (
    <span
      aria-hidden
      className={`${className} flex items-center justify-center font-bold text-accent`}
    >
      {user ? Array.from(user.displayName)[0] : '?'}
    </span>
  )
}
