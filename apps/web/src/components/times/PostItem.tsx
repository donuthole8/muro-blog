import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { TimesPost } from '@blog/api-client'
import { Avatar } from './Avatar'
import { PostMenu } from './PostMenu'
import { ReactionBar } from './ReactionBar'
import { Button } from '../Button'
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
   * list: 部屋・ロビーの一覧（スレッドへのリンクと返信数を出す）
   * thread: スレッドの親投稿 / reply: スレッドの返信
   */
  variant?: 'list' | 'thread' | 'reply'
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

  return (
    <article
      id={variant === 'reply' ? `reply-${post.id}` : undefined}
      className={`flex gap-2 border-b border-border px-1 py-2.5 sm:gap-3 ${pending ? 'opacity-60' : ''}`}
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
              // bodyHtml は Symfony 側で生 HTML を落として変換済み（PostBodyRenderer）
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
              <TagChip key={tag.slug} name={tag.name} slug={tag.slug} />
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
      className="inline-flex min-h-8 items-center rounded-md text-xs text-text-muted transition-colors hover:text-accent"
    >
      💬 {post.replyCount > 0 ? `${post.replyCount}件の返信` : '返信する'}
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
        className="inline-flex min-h-8 items-center rounded-md px-1.5 text-text-muted transition-colors hover:text-accent"
      >
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
        className="inline-flex min-h-8 items-center rounded-md px-1.5 text-text-muted transition-colors hover:text-danger disabled:opacity-40"
      >
        削除
      </button>
    </span>
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
