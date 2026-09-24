type Variant = 'primary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

const base =
  'inline-flex items-center justify-center gap-1.5 rounded-md font-bold whitespace-nowrap transition-colors active:translate-y-px disabled:pointer-events-none disabled:opacity-40'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-bg hover:opacity-90',
  ghost:
    'border border-border text-text-muted hover:border-accent hover:text-accent',
  danger: 'bg-danger text-bg hover:opacity-90',
}

/*
 * 高さはタップ領域として確保する。sm でも 36px を下回らせない
 * （モバイルでの誤タップを防ぐ最低ライン）。
 */
const sizes: Record<Size, string> = {
  sm: 'min-h-9 px-3 text-xs',
  md: 'min-h-11 px-4 text-sm',
}

type ClassOptions = {
  variant?: Variant
  size?: Size
  className?: string
}

/**
 * ボタンの見た目だけが欲しいとき（Link や a に当てる場合）に使う。
 * ボタン要素そのものは下の Button を使う。
 */
export function buttonClass({
  variant = 'primary',
  size = 'md',
  className = '',
}: ClassOptions = {}) {
  return `${base} ${variants[variant]} ${sizes[size]} ${className}`.trim()
}

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & ClassOptions

export function Button({
  variant,
  size,
  className,
  type = 'button',
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      type={type}
      className={buttonClass({ variant, size, className })}
    />
  )
}
