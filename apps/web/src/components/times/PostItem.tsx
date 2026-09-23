import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import type { TimesPost } from '@blog/api-client'
import { Avatar } from './Avatar'
import { PostMenu } from './PostMenu'
import { ReactionBar } from './ReactionBar'
import { Button } from '../Button'
import { Icon } from '../Icon'
import { TagChip } from '../TagChip'
import { fetchPostSource } from '../../lib/account'
import { formatFullTime, formatTimeOfDay } from '../../lib/format'
import { imageUrl } from '../../lib/image'
import { isPendingId, useMe } from '../../lib/queries'
import { usePostActions } from '../../lib/usePostActions'

type Props = {
  post: TimesPost
  /** 自分が付けた絵文字（viewer-state から） */
  myReactions?: Array<string>
  /**
   * list: 部屋・チャンネルの一覧（スレッドへのリンクと返信数を出す）
   * detail: 投稿の詳細画面の主役 / reply: スレッドの返信
   */
  variant?: 'list' | 'detail' | 'reply'
  /** 自分がブロックしている人の投稿（折りたたんで出す） */
  blocked?: boolean
}

export function PostItem({
  post,
  myReactions = [],
  variant = 'list',
  blocked = false,
}: Props) {
  const me = useMe()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const pending = isPendingId(post.id)
  const isMine = me?.handle != null && post.author?.handle === me.handle
  const threadId = post.parentId ?? post.id
  const handle = post.author?.handle

  if (post.state !== 'visible') {
    return (
      <article className="flex gap-2 border-b border-border px-1 py-3 text-sm text-text-muted italic sm:gap-3">
        {/* 時刻カラムぶんの幅を空け、ログの縦の並びを崩さない */}
        <span aria-hidden className="w-10 shrink-0" />
        <span>
          {post.state === 'deleted'
            ? 'この投稿は削除されました'
            : 'この投稿は表示できません'}
          {variant === 'list' && post.replyCount > 0 && handle && (
            <ThreadLink handle={handle} threadId={threadId} post={post} />
          )}
        </span>
      </article>
    )
  }

  if (blocked && !revealed) {
    return (
      <article
        id={variant === 'reply' ? `reply-${post.id}` : undefined}
        className="flex gap-2 border-b border-border px-1 py-3 text-xs text-text-muted sm:gap-3"
      >
        <span aria-hidden className="w-10 shrink-0" />
        <span>
          ブロック中のユーザーの投稿です。{' '}
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="underline hover:text-accent"
          >
            表示する
          </button>
        </span>
      </article>
    )
  }

  if (variant === 'detail') {
    return (
      <PostDetail
        post={post}
        myReactions={myReactions}
        editing={editing}
        onEdit={() => setEditing(true)}
        onEditDone={() => setEditing(false)}
      />
    )
  }

  // 一覧では行のどこを押しても詳細画面へ行ける。リンク・ボタン・メニュー・文字選択は邪魔しない
  const openDetail =
    variant === 'list' && handle && !pending && !editing
      ? (e: React.MouseEvent<HTMLElement>) => {
          const target = e.target as HTMLElement
          if (
            target.closest(
              'a, button, input, textarea, select, label, [data-popover]',
            ) ||
            (window.getSelection()?.toString() ?? '') !== ''
          ) {
            return
          }
          void navigate({
            to: '/@{$handle}/$postId',
            params: { handle, postId: post.id },
          })
        }
      : undefined

  return (
    <article
      id={variant === 'reply' ? `reply-${post.id}` : undefined}
      onClick={openDetail}
      className={`flex gap-2 border-b border-border px-1 py-2.5 sm:gap-3 ${pending ? 'opacity-60' : ''} ${openDetail ? 'cursor-pointer transition-colors hover:bg-accent-soft/40' : ''}`}
    >
      {/*
        分報は作業ログなので、時刻を左端の等幅カラムに固定して縦に揃える。
        日付は PostList が挟む日付区切りが持つため、ここは時刻だけを出す。
      */}
      <TimeColumn post={post} handle={handle} />

      {handle ? (
        <Link to="/@{$handle}" params={{ handle }} className="shrink-0">
          <Avatar user={post.author} size="xs" />
        </Link>
      ) : (
        <Avatar user={null} size="xs" />
      )}

      <div className="min-w-0 flex-1">
        <header className="flex flex-wrap items-baseline gap-x-2 text-sm">
          {handle ? (
            <Link
              to="/@{$handle}"
              params={{ handle }}
              className="font-bold hover:text-accent"
            >
              {post.author?.displayName}
            </Link>
          ) : (
            <span className="font-bold text-text-muted">退会したユーザー</span>
          )}
          {handle && (
            <span className="font-mono text-xs text-text-muted">@{handle}</span>
          )}
          {pending && <span className="text-xs text-text-muted">送信中…</span>}
          {post.editedAt && (
            <span
              className="text-xs text-text-muted"
              title={`${formatFullTime(post.editedAt)} に編集`}
            >
              （編集済み）
            </span>
          )}

          {isMine && !pending && !editing && (
            <OwnerMenu post={post} onEdit={() => setEditing(true)} />
          )}
          {!isMine && me?.handle != null && handle && <PostMenu post={post} />}
        </header>

        {editing ? (
          <EditForm post={post} onDone={() => setEditing(false)} />
        ) : (
          <>
            {post.bodyHtml !== '' && (
              // bodyHtml は API 側で生 HTML をエスケープして変換済み（api-worker の lib/markdown.ts）
              <div
                className="prose prose-blog prose-times mt-1 max-w-none text-[0.95rem]"
                dangerouslySetInnerHTML={{ __html: post.bodyHtml }}
              />
            )}
            {post.imageKey && (
              <a href={imageUrl(post.imageKey)} target="_blank" rel="noopener">
                <img
                  src={imageUrl(post.imageKey)}
                  alt=""
                  loading="lazy"
                  className="mt-2 max-h-96 rounded-lg border border-border"
                />
              </a>
            )}
          </>
        )}

        {post.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {post.tags.map((tag) => (
              <TagChip key={tag.slug} name={tag.name} slug={tag.slug} compact />
            ))}
          </div>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <ReactionBar post={post} mine={myReactions} />
          {variant === 'list' && handle && !pending && (
            <ThreadLink handle={handle} threadId={threadId} post={post} />
          )}
        </div>
      </div>
    </article>
  )
}

/**
 * ログ行の左端に置く時刻。投稿へのリンクも兼ねる。
 * 幅を固定して等幅で出すことで、行が変わっても数字の桁が縦に揃う。
 */
function TimeColumn({ post, handle }: { post: TimesPost; handle?: string }) {
  const base =
    'w-10 shrink-0 pt-0.5 text-right font-mono text-xs tabular-nums text-text-muted'

  if (isPendingId(post.id)) {
    return <span className={base}>··:··</span>
  }

  const label = (
    <time dateTime={post.createdAt} suppressHydrationWarning>
      {formatTimeOfDay(post.createdAt)}
    </time>
  )
  const title = formatFullTime(post.createdAt)

  // 返信はスレッド画面の中にしか出ないので、その場のアンカーにする
  if (post.parentId != null || handle == null) {
    return (
      <a
        href={`#reply-${post.id}`}
        title={title}
        className={`${base} transition-colors hover:text-accent`}
      >
        {label}
      </a>
    )
  }

  return (
    <Link
      to="/@{$handle}/$postId"
      params={{ handle, postId: post.id }}
      title={title}
      className={`${base} transition-colors hover:text-accent`}
    >
      {label}
    </Link>
  )
}

function ThreadLink({
  handle,
  threadId,
  post,
}: {
  handle: string
  threadId: string
  post: TimesPost
}) {
  return (
    <Link
      to="/@{$handle}/$postId"
      params={{ handle, postId: threadId }}
      className="inline-flex min-h-8 items-center gap-1 rounded-md text-xs text-text-muted transition-colors hover:text-accent"
    >
      <Icon name="message" className="h-3.5 w-3.5" />
      {post.replyCount > 0 ? `${post.replyCount}件の返信` : '返信する'}
    </Link>
  )
}

function OwnerMenu({ post, onEdit }: { post: TimesPost; onEdit: () => void }) {
  const { remove } = usePostActions()

  return (
    <span className="ml-auto flex gap-1 text-xs">
      <button
        type="button"
        onClick={onEdit}
        className="inline-flex min-h-8 items-center gap-1 rounded-md px-1.5 text-text-muted transition-colors hover:text-accent"
      >
        <Icon name="pencil" className="h-3.5 w-3.5" />
        編集
      </button>
      <button
        type="button"
        disabled={remove.isPending}
        onClick={() => {
          if (confirm('この投稿を削除します。よろしいですか？')) {
            remove.mutate(post)
          }
        }}
        className="inline-flex min-h-8 items-center gap-1 rounded-md px-1.5 text-text-muted transition-colors hover:text-danger disabled:opacity-40"
      >
        <Icon name="trash" className="h-3.5 w-3.5" />
        削除
      </button>
    </span>
  )
}

/**
 * 投稿の詳細画面の主役。一覧のログ行より大きく、日時を省略せずに出す。
 */
function PostDetail({
  post,
  myReactions,
  editing,
  onEdit,
  onEditDone,
}: {
  post: TimesPost
  myReactions: Array<string>
  editing: boolean
  onEdit: () => void
  onEditDone: () => void
}) {
  const me = useMe()
  const handle = post.author?.handle
  const isMine = me?.handle != null && handle === me.handle

  return (
    <article className="rounded-xl border border-border bg-surface p-4 sm:p-5">
      <header className="flex items-center gap-3">
        {handle ? (
          <Link to="/@{$handle}" params={{ handle }} className="shrink-0">
            <Avatar user={post.author} size="md" />
          </Link>
        ) : (
          <Avatar user={null} size="md" />
        )}
        <div className="min-w-0">
          {handle ? (
            <Link
              to="/@{$handle}"
              params={{ handle }}
              className="block truncate font-bold hover:text-accent"
            >
              {post.author?.displayName}
            </Link>
          ) : (
            <span className="font-bold text-text-muted">退会したユーザー</span>
          )}
          {handle && (
            <span className="block font-mono text-xs text-text-muted">
              @{handle}
            </span>
          )}
        </div>
        {isMine && !editing && <OwnerMenu post={post} onEdit={onEdit} />}
        {!isMine && me?.handle != null && handle && (
          <span className="ml-auto">
            <PostMenu post={post} />
          </span>
        )}
      </header>

      {editing ? (
        <EditForm post={post} onDone={onEditDone} />
      ) : (
        <>
          {post.bodyHtml !== '' && (
            // bodyHtml は API 側で生 HTML をエスケープして変換済み（api-worker の lib/markdown.ts）
            <div
              className="prose prose-blog prose-times mt-4 max-w-none text-base"
              dangerouslySetInnerHTML={{ __html: post.bodyHtml }}
            />
          )}
          {post.imageKey && (
            <a href={imageUrl(post.imageKey)} target="_blank" rel="noopener">
              <img
                src={imageUrl(post.imageKey)}
                alt=""
                className="mt-4 max-h-[36rem] w-full rounded-lg border border-border object-contain"
              />
            </a>
          )}
        </>
      )}

      {post.tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {post.tags.map((tag) => (
            <TagChip key={tag.slug} name={tag.name} slug={tag.slug} compact />
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-3 text-xs text-text-muted">
        <time dateTime={post.createdAt} suppressHydrationWarning>
          {formatFullTime(post.createdAt)}
        </time>
        {post.editedAt && (
          <span suppressHydrationWarning>
            {formatFullTime(post.editedAt)} に編集
          </span>
        )}
        <CopyLinkButton />
      </div>

      <div className="mt-3">
        <ReactionBar post={post} mine={myReactions} />
      </div>
    </article>
  )
}

function CopyLinkButton() {
  const [copied, setCopied] = useState(false)

  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(window.location.href).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        })
      }}
      className="ml-auto inline-flex min-h-8 items-center gap-1 rounded-md px-1.5 transition-colors hover:text-accent"
    >
      <Icon name="link" className="h-3.5 w-3.5" />
      {copied ? 'コピーしました' : 'リンクをコピー'}
    </button>
  )
}

/** その場での編集。Markdown 原文は本人だけが取れるので、開いたときに取りに行く。 */
function EditForm({ post, onDone }: { post: TimesPost; onDone: () => void }) {
  const source = useQuery({
    queryKey: ['post-source', post.id],
    queryFn: () => fetchPostSource({ data: { id: post.id } }),
    staleTime: 0,
    gcTime: 0,
  })

  if (source.isPending) {
    return <p className="mt-2 text-xs text-text-muted">読み込み中…</p>
  }
  if (!source.data) {
    return (
      <p className="mt-2 text-xs text-danger">
        編集できませんでした。{' '}
        <button type="button" onClick={onDone} className="underline">
          閉じる
        </button>
      </p>
    )
  }

  return (
    <EditFields
      post={post}
      initial={source.data.bodyMarkdown}
      onDone={onDone}
    />
  )
}

function EditFields({
  post,
  initial,
  onDone,
}: {
  post: TimesPost
  initial: string
  onDone: () => void
}) {
  const { edit } = usePostActions()
  const [body, setBody] = useState(initial)
  const [error, setError] = useState<string | null>(null)

  return (
    <form
      className="mt-2 space-y-2"
      onSubmit={(e) => {
        e.preventDefault()
        edit.mutate(
          {
            post,
            bodyMarkdown: body,
            tagSlugs: post.tags.map((tag) => tag.slug),
          },
          {
            onSuccess: (result) => {
              if (result.ok) onDone()
              else setError(Object.values(result.errors)[0] ?? result.message)
            },
          },
        )
      }}
    >
      <textarea
        value={body}
        autoFocus
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onDone()
        }}
        className="field-sizing-content min-h-20 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
      />
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={edit.isPending}>
          {edit.isPending ? '保存中…' : '保存'}
        </Button>
        <button
          type="button"
          onClick={onDone}
          className="inline-flex min-h-9 items-center rounded-md px-2 text-xs text-text-muted transition-colors hover:text-accent"
        >
          キャンセル
        </button>
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    </form>
  )
}
