import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { TagSummary } from '@blog/api-client'
import { previewMarkdown } from '../../lib/admin'
import type { PostInput } from '../../lib/admin'
import { uploadImage } from '../../lib/adminUploads'
import { EmojiPicker } from './EmojiPicker'
import { MarkdownEditor } from './MarkdownEditor'
import { TagPicker } from './TagPicker'
import { useDebounced } from './useDebounced'

async function handleImageDrop(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const result = await uploadImage({
    data: { contentType: file.type, bytes },
  })

  if (!result.ok) throw new Error(result.message)

  return result.url
}

type Props = {
  initial: PostInput
  allTags: Array<TagSummary>
  /** フィールド名 => エラーメッセージ */
  errors: Record<string, string>
  isSaving: boolean
  /** 編集時のみ表示する公開状態の操作 */
  statusSlot?: React.ReactNode
  onSubmit: (input: PostInput) => void
}

export function PostEditor({
  initial,
  allTags,
  errors,
  isSaving,
  statusSlot,
  onSubmit,
}: Props) {
  const [form, setForm] = useState<PostInput>(initial)
  // エディタ自体が整形済みの見た目になるので、変換結果の確認は必要なときだけ
  const [showPreview, setShowPreview] = useState(false)

  // 入力のたびに API を叩かないよう、打鍵が止まってから変換する
  const debouncedBody = useDebounced(form.bodyMd, 400)

  const preview = useQuery({
    queryKey: ['admin', 'preview', debouncedBody],
    queryFn: () => previewMarkdown({ data: { bodyMd: debouncedBody } }),
    enabled: showPreview && debouncedBody.length > 0,
    staleTime: Infinity,
  })

  const update = <TKey extends keyof PostInput>(
    key: TKey,
    value: PostInput[TKey],
  ) => setForm((prev) => ({ ...prev, [key]: value }))

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(form)
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
            <span className="mt-1 block text-xs text-red-500">
              {errors.emoji}
            </span>
          )}
        </div>

        <div className="flex-1">
          <Field label="タイトル" error={errors.title}>
            <input
              value={form.title}
              onChange={(e) => update('title', e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-base"
              placeholder="記事のタイトル"
            />
          </Field>
        </div>
      </div>

      <Field
        label="slug"
        error={errors.slug}
        hint="URL に使われます。英小文字・数字・ハイフンのみ。"
      >
        <input
          value={form.slug}
          onChange={(e) => update('slug', e.target.value)}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm"
          placeholder="hello-world"
        />
      </Field>

      <Field label="タグ">
        <TagPicker
          allTags={allTags}
          selected={form.tagSlugs}
          onChange={(slugs) => update('tagSlugs', slugs)}
        />
      </Field>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-bold text-text-muted">
            本文（Markdown）
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
            showPreview ? 'grid gap-3 lg:grid-cols-2' : 'grid gap-3 grid-cols-1'
          }
        >
          <MarkdownEditor
            value={form.bodyMd}
            onChange={(bodyMd) => update('bodyMd', bodyMd)}
            placeholder={'# 見出し\n\n本文を書きます。'}
            onImageDrop={handleImageDrop}
          />

          {showPreview && (
            <div className="min-h-96 overflow-auto rounded-md border border-border bg-surface p-4">
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
          <p className="mt-1 text-xs text-red-500">{errors.bodyMd}</p>
        )}
      </div>

      <Field
        label="抜粋"
        error={errors.excerpt}
        hint="空欄なら本文から自動生成されます。"
      >
        <input
          value={form.excerpt ?? ''}
          onChange={(e) => update('excerpt', e.target.value || null)}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
          placeholder={preview.data?.excerpt ?? '自動生成'}
        />
      </Field>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <button
          type="submit"
          disabled={isSaving}
          className="rounded-md bg-accent px-4 py-2 text-sm font-bold text-bg disabled:opacity-40"
        >
          {isSaving ? '保存中…' : '保存'}
        </button>
        {statusSlot}
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
      {error && (
        <span className="mt-1 block text-xs text-red-500">{error}</span>
      )}
    </label>
  )
}
