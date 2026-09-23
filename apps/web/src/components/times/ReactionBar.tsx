import type { TimesPost } from '@blog/api-client'
import { EmojiPalette } from './EmojiPalette'
import { Icon } from '../Icon'
import { Popover } from './Popover'
import { isPendingId, useMe } from '../../lib/queries'
import { loginUrl } from '../../lib/site'
import { usePostActions } from '../../lib/usePostActions'

type Props = {
  post: TimesPost
  /** 自分が付けた絵文字 */
  mine: Array<string>
}

export function ReactionBar({ post, mine }: Props) {
  const me = useMe()
  const { react } = usePostActions()
  const canReact = me?.handle != null && !isPendingId(post.id)

  const toggle = (emoji: string) => {
    if (!canReact) return
    react.mutate({ postId: post.id, emoji, on: !mine.includes(emoji) })
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {post.reactions.map((reaction) => {
        const active = mine.includes(reaction.emoji)
        return (
          <button
            key={reaction.emoji}
            type="button"
            onClick={() => toggle(reaction.emoji)}
            disabled={!canReact}
            aria-pressed={active}
            className={
              // 指で押せる高さ（32px）を確保する。分報はモバイルで読まれる
              'inline-flex min-h-8 items-center gap-1 rounded-full border px-2.5 text-xs transition-colors disabled:cursor-default ' +
              (active
                ? 'border-accent bg-accent-soft text-accent'
                : 'border-border text-text-muted hover:border-accent')
            }
          >
            <span className="text-sm">{reaction.emoji}</span>
            {reaction.count}
          </button>
        )
      })}

      {canReact ? (
        <Popover
          trigger={({ toggle: open }) => (
            <button
              type="button"
              onClick={open}
              aria-label="リアクションを付ける"
              className="inline-flex min-h-8 items-center rounded-full border border-dashed border-border px-2.5 text-xs text-text-muted transition-colors hover:border-accent hover:text-accent"
            >
              <Icon name="smilePlus" />
            </button>
          )}
        >
          {(close) => (
            <EmojiPalette
              onPick={(emoji) => {
                close()
                if (!mine.includes(emoji)) {
                  react.mutate({ postId: post.id, emoji, on: true })
                }
              }}
            />
          )}
        </Popover>
      ) : (
        me === null &&
        post.reactions.length === 0 && (
          <a
            href={loginUrl()}
            aria-label="ログインしてリアクションを付ける"
            className="inline-flex min-h-8 items-center rounded-full px-1 text-xs text-text-muted transition-colors hover:text-accent"
            title="ログインするとリアクションできます"
          >
            <Icon name="smilePlus" />
          </a>
        )
      )}
    </div>
  )
}
