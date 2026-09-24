import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ArticleInput } from '@blog/api-client'
import { Button } from '../Button'
import { TagPicker } from '../times/TagPicker'
import { EmojiPicker } from './EmojiPicker'
import { MarkdownEditor } from './MarkdownEditor'
import { uploadPostImage } from '../../lib/account'
import { previewArticle } from '../../lib/articles'
import { imageUrl, prepareImage } from '../../lib/image'
import { tagsQuery } from '../../lib/queries'
import { useDebounced } from '../../lib/useDebounced'

export type ArticleForm = Omit<ArticleInput, 'status'>
type Status = ArticleInput['status']

/** 本文に貼った画像は投稿の画像と同じ置き場（KV）に上げ、URL を Markdown に埋める。 */
async function handleImageDrop(file: File): Promise<string> {
  const { blob, contentType } = await prepareImage(file)
  const result = await uploadPostImage({
    data: { contentType, bytes: new Uint8Array(await blob.arrayBuffer()) },
  })
  if (!result.ok) throw new Error(result.message)

  return imageUrl(result.key)
}

type Props = {
  initial: ArticleForm
  /** 保存済みの公開状態。新規なら draft */
  status: Status
  /** フィールド名 => エラーメッセージ */
  errors: Record<string, string>
  isSaving: boolean
  onSave: (form: ArticleForm, status: Status) => void
  /** 保存ボタンの横に置く操作（削除など） */
  children?: React.ReactNode
}

/**
 * ブログ記事の編集画面。本文は書いたそばから見た目が整う Markdown エディタで書く。
 */
export function ArticleEditor({
  initial,
  status,
  errors,
  isSaving,
  onSave,
  children,
}: Props) {
  const [form, setForm] = useState<ArticleForm>(initial)
  // エディタ自体が整形済みの見た目になるので、変換結果の確認は必要なときだけ
  const [showPreview, setShowPreview] = useState(false)
  const tags = useQuery(tagsQuery)

  const dirty = JSON.stringify(form) !== JSON.stringify(initial)
  // 長文を書いている途中でタブを閉じて消えないように
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  // 入力のたびに API を叩かないよう、打鍵が止まってから変換する
  const debouncedBody = useDebounced(form.bodyMd, 400)
  const preview = useQuery({
    queryKey: ['article-preview', debouncedBody],
    queryFn: () => previewArticle({ data: { bodyMd: debouncedBody } }),
    enabled: showPreview && debouncedBody.length > 0,
    staleTime: Infinity,
  })

  const update = <TKey extends keyof ArticleForm>(
    key: TKey,
    value: ArticleForm[TKey],
  ) => setForm((prev) => ({ ...prev, [key]: value }))

  const published = status === 'published'

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSave(form, status)
      }}
      className="space-y-5"
    >
      <div className="flex items-start gap-4">
        <div>
          <span className="mb-1.5 block text-xs font-bold text-text-muted">
            絵文字
          </span>
          <EmojiPicker
            value={form.emoji ?? null}
            onChange={(emoji) => update('emoji', emoji)}
          />
          {errors.emoji && (
            <span className="mt-1 block text-xs text-danger">
              {errors.emoji}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <Field label="タイトル" error={errors.title}>
            <input
              value={form.title}
              onChange={(e) => update('title', e.target.value)}
              maxLength={200}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-base focus:border-accent"
              placeholder="記事のタイトル"
            />
          </Field>
        </div>
      </div>

      <Field
        label="slug"
        error={errors.slug}
        hint="記事の URL（/@handle/articles/slug）に使います。英小文字・数字・ハイフンのみ。空欄なら自動で付けます。"
      >
        <input
          value={form.slug ?? ''}
          onChange={(e) => update('slug', e.target.value)}
          maxLength={100}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm focus:border-accent"
          placeholder="hello-world"
        />
      </Field>

      <div>
        <span className="mb-1.5 block text-xs font-bold text-text-muted">
          タグ
        </span>
        <TagPicker
          tags={tags.data ?? []}
          tagSlugs={form.tagSlugs ?? []}
          newTags={form.newTags ?? []}
          onChange={(tagSlugs, newTags) =>
            setForm((prev) => ({ ...prev, tagSlugs, newTags }))
          }
        />
        {(errors.tagSlugs || errors.newTags) && (
          <span className="mt-1 block text-xs text-danger">
            {errors.tagSlugs ?? errors.newTags}
          </span>
        )}
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-bold text-text-muted">
            本文（Markdown・画像は貼り付け / ドロップで追加）
          </span>
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className="text-xs text-text-muted transition-colors hover:text-accent"
          >
            {showPreview ? 'プレビューを隠す' : 'プレビューを表示'}
          </button>
        </div>

        <div
          className={
            showPreview ? 'grid gap-3 lg:grid-cols-2' : 'grid grid-cols-1 gap-3'
          }
        >
          <MarkdownEditor
            value={form.bodyMd}
            onChange={(bodyMd) => update('bodyMd', bodyMd)}
            placeholder={'## 見出し\n\n本文を書きます。'}
            onImageDrop={handleImageDrop}
          />

          {showPreview && (
            <div className="min-h-96 min-w-0 overflow-auto rounded-md border border-border bg-surface p-4">
              {preview.isFetching && (
                <p className="text-xs text-text-muted">変換中…</p>
              )}
              {preview.data ? (
                <div
                  className="prose prose-blog max-w-none"
                  dangerouslySetInnerHTML={{ __html: preview.data.bodyHtml }}
                />
              ) : (
                !preview.isFetching && (
                  <p className="text-xs text-text-muted">
                    本文を入力するとここにプレビューが出ます。
                  </p>
                )
              )}
            </div>
          )}
        </div>
        {errors.bodyMd && (
          <p className="mt-1 text-xs text-danger">{errors.bodyMd}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        {published ? (
          <>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? '保存中…' : '更新する'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={isSaving}
              onClick={() => onSave(form, 'draft')}
            >
              下書きに戻す
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              disabled={isSaving}
              onClick={() => onSave(form, 'published')}
            >
              {isSaving ? '保存中…' : '公開する'}
            </Button>
            <Button type="submit" variant="ghost" disabled={isSaving}>
              下書き保存
            </Button>
          </>
        )}
        <span className="text-xs text-text-muted">
          {published ? '公開中' : '下書き（自分にしか見えません）'}
          {dirty && '・未保存の変更があります'}
        </span>
        {children}
      </div>
    </form>
  )
}

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string
  error?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-text-muted">
        {label}
      </span>
      {children}
      {hint && !error && (
        <span className="mt-1 block text-xs text-text-muted">{hint}</span>
      )}
      {error && <span className="mt-1 block text-xs text-danger">{error}</span>}
    </label>
  )
}
