import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type {
  ArticleCard as ArticleCardData,
  TagWithCount,
  TimesPost,
} from '@blog/api-client'
import { Button } from '../Button'
import { Icon } from '../Icon'
import { ArticleCard } from '../articles/ArticleCard'
import { Popover } from './Popover'
import { createPost, uploadPostImage } from '../../lib/account'
import { DEFAULT_EMOJI } from '../../lib/emoji'
import { imageUrl, prepareImage } from '../../lib/image'
import {
  appendReply,
  pendingPost,
  prependParentPost,
  replacePost,
  updatePostEverywhere,
} from '../../lib/postCache'
import { myArticlesQuery, tagsQuery, useMe } from '../../lib/queries'
import { loginUrl } from '../../lib/site'
import { draftKey, useDraft } from '../../lib/useDraft'
import { TagPicker } from './TagPicker'

const MAX_LENGTH = 2000

type Props = {
  /** 指定すると、そのスレッドへの返信になる */
  parentId?: string
  autoFocus?: boolean
  /** 最初から添付しておく記事 */
  initialArticle?: ArticleCardData
  /** 投稿を受け付けた（楽観的に画面へ出した）ときに呼ばれる */
  onSubmitted?: () => void
}

/**
 * 投稿の入力欄。部屋とスレッドでは画面下部に固定し、それ以外ではモーダルの中で使う。
 *
 * 送信したら応答を待たずに一覧へ仮の投稿を差し込み（楽観的更新）、
 * 保存できたら本物に置き換える。失敗したら仮の投稿を消して入力を戻す。
 */
export function Composer({
  parentId,
  autoFocus,
  initialArticle,
  onSubmitted,
}: Props) {
  const me = useMe()
  const queryClient = useQueryClient()
  const isReply = parentId !== undefined

  const [body, setBody] = useState('')
  const [tagSlugs, setTagSlugs] = useState<Array<string>>([])
  const [newTags, setNewTags] = useState<Array<string>>([])
  const [image, setImage] = useState<{ key: string; preview: string } | null>(
    null,
  )
  const [article, setArticle] = useState<ArticleCardData | null>(
    initialArticle ?? null,
  )
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 送信中は下書きを書き換えない（成功を確かめてから消す）
  const [sending, setSending] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const tags = useQuery({ ...tagsQuery, enabled: !isReply && me != null })

  type Draft = {
    body: string
    tagSlugs: Array<string>
    newTags: Array<string>
    image: { key: string; preview: string } | null
    article: ArticleCardData | null
  }

  /** 送信を取り消して、仮の投稿を消し入力を元に戻す。 */
  const rollback = (pending: TimesPost, draft: Draft, message: string) => {
    updatePostEverywhere(queryClient, pending.id, () => null)
    if (parentId !== undefined) {
      updatePostEverywhere(queryClient, parentId, (parent) => ({
        ...parent,
        replyCount: Math.max(0, parent.replyCount - 1),
      }))
    }
    setBody(draft.body)
    setTagSlugs(draft.tagSlugs)
    setNewTags(draft.newTags)
    setImage(draft.image)
    setArticle(draft.article)
    setError(message)
  }

  const saved = useDraft(
    me?.handle ? draftKey(me.handle, parentId) : null,
    { body, tagSlugs, newTags, imageKey: image?.key ?? null, article },
    (draft) => {
      setBody(draft.body)
      setTagSlugs(draft.tagSlugs)
      setNewTags(draft.newTags)
      setImage(
        draft.imageKey
          ? { key: draft.imageKey, preview: imageUrl(draft.imageKey) }
          : null,
      )
      // 共有するつもりで開いた記事は、書きかけの下書きより優先する
      setArticle(initialArticle ?? draft.article)
    },
    { paused: sending },
  )

  // 送信後すぐに入力欄を空にするので、送る内容と戻す内容は変数として持ち回す
  const submit = useMutation({
    mutationFn: ({ draft }: { pending: TimesPost; draft: Draft }) =>
      createPost({
        data: {
          bodyMarkdown: draft.body.trim(),
          parentId: parentId ?? null,
          imageKey: draft.image?.key ?? null,
          tagSlugs: isReply ? [] : draft.tagSlugs,
          newTags: isReply ? [] : draft.newTags,
          articleId: draft.article?.id ?? null,
        },
      }),
    onMutate: ({ pending }) => {
      setSending(true)
      if (parentId !== undefined) {
        appendReply(queryClient, parentId, pending)
      } else if (me?.handle) {
        prependParentPost(queryClient, me.handle, pending)
      }
      setBody('')
      setTagSlugs([])
      setNewTags([])
      setImage(null)
      setArticle(null)
      setError(null)
      saved.dismissRestored()
      onSubmitted?.()
    },
    onSuccess: (result, { pending, draft }) => {
      if (result.ok) {
        replacePost(queryClient, pending.id, result.post)
        // 新しく作られたタグを、次の投稿の候補にすぐ出す（タグ一覧の API は数分キャッシュされる）
        queryClient.setQueryData<Array<TagWithCount>>(
          tagsQuery.queryKey,
          (current) => {
            if (!current) return current
            const known = new Set(current.map((tag) => tag.slug))
            const added = result.post.tags
              .filter((tag) => !known.has(tag.slug))
              .map((tag) => ({ ...tag, postCount: 1 }))
            return added.length > 0 ? [...current, ...added] : current
          },
        )
        // 保存できたと確かめてから下書きを消す（途中でタブを閉じても書きかけが残る）
        saved.clear()
        return
      }
      rollback(
        pending,
        draft,
        Object.values(result.errors)[0] ?? result.message,
      )
    },
    onSettled: () => setSending(false),
    onError: (_error, { pending, draft }) =>
      rollback(
        pending,
        draft,
        '投稿に失敗しました。通信状況を確認してください。',
      ),
  })

  if (!me) {
    return (
      <p className="text-center text-sm text-text-muted">
        <a href={loginUrl()} className="text-accent hover:underline">
          ログイン
        </a>
        すると{isReply ? '返信' : '投稿'}できます
      </p>
    )
  }

  if (!me.handle) {
    return (
      <p className="text-center text-sm text-text-muted">
        <Link to="/welcome" className="text-accent hover:underline">
          handle を決める
        </Link>
        と投稿できるようになります
      </p>
    )
  }

  const trimmed = body.trim()
  const tooLong = body.length > MAX_LENGTH
  const canSubmit =
    (trimmed !== '' || image !== null || article !== null) &&
    !tooLong &&
    !uploading

  const send = () => {
    if (!canSubmit) return
    const selectedTags = [
      ...(tags.data ?? [])
        .filter((tag) => tagSlugs.includes(tag.slug))
        .map((tag) => ({ name: tag.name, slug: tag.slug })),
      // 仮の slug。保存できたら API が付けた本物に置き換わる
      ...newTags.map((name) => ({ name, slug: `pending-${name}` })),
    ]

    submit.mutate({
      draft: { body, tagSlugs, newTags, image, article },
      pending: pendingPost(me, {
        bodyMarkdown: trimmed,
        parentId: parentId ?? null,
        imageKey: image?.key ?? null,
        tags: selectedTags,
        article,
      }),
    })
  }

  const attach = async (file: File) => {
    setError(null)
    setUploading(true)
    try {
      const { blob, contentType } = await prepareImage(file)
      const result = await uploadPostImage({
        data: {
          contentType,
          bytes: new Uint8Array(await blob.arrayBuffer()),
        },
      })
      if (!result.ok) throw new Error(result.message)
      setImage({ key: result.key, preview: imageUrl(result.key) })
    } catch (e) {
      setError(
        e instanceof Error ? e.message : '画像のアップロードに失敗しました。',
      )
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        send()
      }}
      className="space-y-2"
    >
      <textarea
        value={body}
        autoFocus={autoFocus}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            send()
          }
        }}
        onPaste={(e) => {
          const file = Array.from(e.clipboardData.files).find((f) =>
            f.type.startsWith('image/'),
          )
          if (file && !image) {
            e.preventDefault()
            void attach(file)
          }
        }}
        rows={isReply ? 2 : 3}
        placeholder={
          isReply
            ? 'スレッドに返信（Markdown）'
            : 'いまなにしてる？（Markdown）'
        }
        aria-label={isReply ? '返信' : '投稿'}
        className="field-sizing-content max-h-72 min-h-16 w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-accent"
      />

      {image && (
        <div className="relative inline-block">
          <img
            src={image.preview}
            alt="添付する画像"
            className="max-h-32 rounded-md border border-border"
          />
          <button
            type="button"
            onClick={() => setImage(null)}
            aria-label="画像を外す"
            className="absolute -top-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-xs"
          >
            ×
          </button>
        </div>
      )}

      {article && (
        <ArticleCard article={article} onRemove={() => setArticle(null)} />
      )}

      {!isReply && (
        <TagPicker
          tags={tags.data ?? []}
          tagSlugs={tagSlugs}
          newTags={newTags}
          onChange={(slugs, names) => {
            setTagSlugs(slugs)
            setNewTags(names)
          }}
        />
      )}

      <div className="flex items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void attach(file)
          }}
        />
        <button
          type="button"
          disabled={image !== null || uploading}
          onClick={() => fileRef.current?.click()}
          aria-label="画像を添付"
          className="inline-flex min-h-9 items-center gap-1 rounded-md px-1 text-xs text-text-muted transition-colors hover:text-accent disabled:opacity-40"
        >
          <Icon name="image" className="h-4 w-4" />
          {uploading ? '画像を処理中…' : '画像'}
        </button>
        <ArticlePicker
          disabled={article !== null}
          onPick={(picked) => setArticle(picked)}
        />

        {error && <span className="text-xs text-danger">{error}</span>}
        {!error && saved.restored && (
          <span className="text-xs text-text-muted">
            下書きを復元しました{' '}
            <button
              type="button"
              onClick={() => {
                saved.clear()
                setBody('')
                setTagSlugs([])
                setNewTags([])
                setImage(null)
                setArticle(null)
              }}
              className="underline hover:text-accent"
            >
              破棄
            </button>
          </span>
        )}

        <span
          className={`ml-auto font-mono text-xs ${tooLong ? 'text-danger' : 'text-text-muted'}`}
        >
          {body.length}/{MAX_LENGTH}
        </span>
        <Button
          type="submit"
          size="sm"
          disabled={!canSubmit}
          title="Ctrl / ⌘ + Enter でも送信できます"
        >
          {isReply ? '返信' : '投稿'}
        </Button>
      </div>
    </form>
  )
}

/**
 * 自分の公開済みの記事から1つ選んで添付する。
 * 候補はパネルを開いたときに取りに行く（Popover は開くまで中身を描かない）。
 */
function ArticlePicker({
  disabled,
  onPick,
}: {
  disabled: boolean
  onPick: (article: ArticleCardData) => void
}) {
  return (
    <Popover
      trigger={({ toggle }) => (
        <button
          type="button"
          disabled={disabled}
          onClick={toggle}
          aria-label="記事を添付"
          className="inline-flex min-h-9 items-center gap-1 rounded-md px-1 text-xs text-text-muted transition-colors hover:text-accent disabled:opacity-40"
        >
          <Icon name="article" className="h-4 w-4" />
          記事
        </button>
      )}
    >
      {(close) => (
        <ArticlePickerPanel
          onPick={(article) => {
            onPick(article)
            close()
          }}
          onClose={close}
        />
      )}
    </Popover>
  )
}

function ArticlePickerPanel({
  onPick,
  onClose,
}: {
  onPick: (article: ArticleCardData) => void
  onClose: () => void
}) {
  const me = useMe()
  const articles = useQuery(myArticlesQuery)
  const published = (articles.data ?? []).filter(
    (article) => article.status === 'published',
  )

  return (
    <div className="w-72 overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
      <p className="border-b border-border px-3 py-2 text-xs font-bold text-text-muted">
        添付する記事を選ぶ
      </p>
      <div className="max-h-64 overflow-y-auto py-1">
        {articles.isPending ? (
          <p className="px-3 py-2 text-xs text-text-muted">読み込み中…</p>
        ) : published.length === 0 ? (
          <p className="px-3 py-2 text-xs text-text-muted">
            公開中の記事がありません。
          </p>
        ) : (
          published.map((article) => (
            <button
              key={article.id}
              type="button"
              onClick={() =>
                onPick({
                  id: article.id,
                  slug: article.slug,
                  title: article.title,
                  emoji: article.emoji,
                  excerpt: article.excerpt,
                  author: me?.handle
                    ? {
                        handle: me.handle,
                        displayName: me.displayName,
                        avatarUrl: me.avatarUrl,
                      }
                    : null,
                })
              }
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent-soft"
            >
              <span aria-hidden>{article.emoji || DEFAULT_EMOJI}</span>
              <span className="min-w-0 flex-1 truncate">{article.title}</span>
            </button>
          ))
        )}
      </div>
      <Link
        to="/articles/new"
        onClick={onClose}
        className="flex items-center gap-1 border-t border-border px-3 py-2 text-xs text-accent hover:bg-accent-soft"
      >
        <Icon name="plus" className="h-3.5 w-3.5" />
        新しく記事を書く
      </Link>
    </div>
  )
}
