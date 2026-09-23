import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { TagWithCount, TimesPost } from '@blog/api-client'
import { Button } from '../Button'
import { Icon } from '../Icon'
import { createPost, uploadPostImage } from '../../lib/account'
import { imageUrl, prepareImage } from '../../lib/image'
import {
  appendReply,
  pendingPost,
  prependParentPost,
  replacePost,
  updatePostEverywhere,
} from '../../lib/postCache'
import { tagsQuery, useMe } from '../../lib/queries'
import { loginUrl } from '../../lib/site'
import { draftKey, useDraft } from '../../lib/useDraft'

const MAX_LENGTH = 2000
const MAX_TAGS = 3
const MAX_TAG_NAME_LENGTH = 32
/** 候補として並べる既存タグの数（投稿数の多い順） */
const TAG_SUGGESTIONS = 8

/** API（api-worker の normalizeTagName）と同じ正規化。先頭の # を落とし、空白はハイフンに。 */
function normalizeTagName(raw: string) {
  return raw.trim().replace(/^#+/, '').trim().replace(/\s+/g, '-')
}

type Props = {
  /** 指定すると、そのスレッドへの返信になる */
  parentId?: string
  autoFocus?: boolean
  /** 投稿を受け付けた（楽観的に画面へ出した）ときに呼ばれる */
  onSubmitted?: () => void
}

/**
 * 投稿の入力欄。部屋とスレッドでは画面下部に固定し、それ以外ではモーダルの中で使う。
 *
 * 送信したら応答を待たずに一覧へ仮の投稿を差し込み（楽観的更新）、
 * 保存できたら本物に置き換える。失敗したら仮の投稿を消して入力を戻す。
 */
export function Composer({ parentId, autoFocus, onSubmitted }: Props) {
  const me = useMe()
  const queryClient = useQueryClient()
  const isReply = parentId !== undefined

  const [body, setBody] = useState('')
  const [tagSlugs, setTagSlugs] = useState<Array<string>>([])
  const [newTags, setNewTags] = useState<Array<string>>([])
  const [image, setImage] = useState<{ key: string; preview: string } | null>(
    null,
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
    setError(message)
  }

  const saved = useDraft(
    me?.handle ? draftKey(me.handle, parentId) : null,
    { body, tagSlugs, newTags, imageKey: image?.key ?? null },
    (draft) => {
      setBody(draft.body)
      setTagSlugs(draft.tagSlugs)
      setNewTags(draft.newTags)
      setImage(
        draft.imageKey
          ? { key: draft.imageKey, preview: imageUrl(draft.imageKey) }
          : null,
      )
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
  const canSubmit = (trimmed !== '' || image !== null) && !tooLong && !uploading

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
      draft: { body, tagSlugs, newTags, image },
      pending: pendingPost(me, {
        bodyMarkdown: trimmed,
        parentId: parentId ?? null,
        imageKey: image?.key ?? null,
        tags: selectedTags,
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
 * タグの選択。既存のタグを候補から選ぶか、名前を入力して Enter で新しいタグを付ける
 * （新しいタグは投稿したときに作られる）。
 */
function TagPicker({
  tags,
  tagSlugs,
  newTags,
  onChange,
}: {
  tags: Array<TagWithCount>
  tagSlugs: Array<string>
  newTags: Array<string>
  onChange: (tagSlugs: Array<string>, newTags: Array<string>) => void
}) {
  const [input, setInput] = useState('')
  const full = tagSlugs.length + newTags.length >= MAX_TAGS
  const query = normalizeTagName(input).toLowerCase()

  const selected = [
    ...tags
      .filter((tag) => tagSlugs.includes(tag.slug))
      .map((tag) => ({ key: tag.slug, name: tag.name, isNew: false })),
    ...newTags.map((name) => ({ key: `new:${name}`, name, isNew: true })),
  ]
  const suggestions = tags
    .filter(
      (tag) =>
        !tagSlugs.includes(tag.slug) &&
        (query === '' ||
          tag.name.toLowerCase().includes(query) ||
          tag.slug.includes(query)),
    )
    .slice(0, TAG_SUGGESTIONS)

  const pick = (slug: string) => {
    if (full || tagSlugs.includes(slug)) return
    onChange([...tagSlugs, slug], newTags)
    setInput('')
  }

  const add = () => {
    const name = normalizeTagName(input)
    if (name === '' || full) return
    // 既にあるタグと同じ名前ならそれを選ぶ（大文字・小文字は区別しない）
    const existing = tags.find(
      (tag) =>
        tag.name.toLowerCase() === name.toLowerCase() ||
        tag.slug === name.toLowerCase(),
    )
    if (existing) {
      pick(existing.slug)
      return
    }
    if (!newTags.some((n) => n.toLowerCase() === name.toLowerCase())) {
      onChange(tagSlugs, [...newTags, name])
    }
    setInput('')
  }

  const remove = (item: (typeof selected)[number]) => {
    if (item.isNew) {
      onChange(
        tagSlugs,
        newTags.filter((n) => n !== item.name),
      )
    } else {
      onChange(
        tagSlugs.filter((s) => s !== item.key),
        newTags,
      )
    }
  }

  const chip =
    'inline-flex min-h-8 items-center gap-1 rounded-full border px-2.5 text-xs transition-colors'

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {selected.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => remove(item)}
          aria-label={`タグ「${item.name}」を外す`}
          title={item.isNew ? '新しいタグ（投稿すると作られます）' : undefined}
          className={`${chip} border-accent bg-accent-soft text-accent`}
        >
          #{item.name}
          {item.isNew && <span className="text-[0.6rem] opacity-70">new</span>}
          <Icon name="x" className="h-3 w-3" />
        </button>
      ))}

      {!full && (
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return
            if (e.key === 'Enter' || e.key === ',' || e.key === '、') {
              e.preventDefault()
              add()
            } else if (e.key === 'Backspace' && input === '') {
              const last = selected.at(-1)
              if (last) remove(last)
            }
          }}
          onBlur={add}
          maxLength={MAX_TAG_NAME_LENGTH + 1}
          placeholder={selected.length === 0 ? '#タグを追加（Enter）' : '#追加'}
          aria-label="タグを追加"
          className="min-h-8 w-36 rounded-full border border-dashed border-border bg-transparent px-2.5 text-xs focus:border-accent focus:outline-none"
        />
      )}

      {!full &&
        suggestions.map((tag) => (
          <button
            key={tag.slug}
            type="button"
            // 入力欄の blur（= 入力中の名前を追加）より先に選ばせる
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pick(tag.slug)}
            className={`${chip} border-border text-text-muted hover:border-accent`}
          >
            #{tag.name}
          </button>
        ))}

      {!full &&
        query !== '' &&
        !tags.some((tag) => tag.name.toLowerCase() === query) && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={add}
            className={`${chip} border-dashed border-accent text-accent`}
          >
            <Icon name="plus" className="h-3 w-3" />「{normalizeTagName(input)}
            」を作る
          </button>
        )}
    </div>
  )
}
