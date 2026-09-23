import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { TagSummary } from '@blog/api-client'
import { createAdminTag } from '../../lib/admin'

type Props = {
  allTags: Array<TagSummary>
  selected: Array<string>
  onChange: (slugs: Array<string>) => void
}

/**
 * タグの選択と新規作成。
 *
 * 日本語のタグ名から slug を機械的に導出できないため、
 * 新規作成では名前と slug を両方入力させる。
 */
export function TagPicker({ allTags, selected, onChange }: Props) {
  const queryClient = useQueryClient()
  const [isCreating, setIsCreating] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')

  const createTag = useMutation({
    mutationFn: (input: { name: string; slug: string }) =>
      createAdminTag({ data: input }),
    onSuccess: (result) => {
      if (!result.ok) return

      queryClient.invalidateQueries({ queryKey: ['admin', 'tags'] })
      onChange([...selected, result.tag.slug])
      setIsCreating(false)
      setName('')
      setSlug('')
    },
  })

  const createFailure =
    createTag.data && !createTag.data.ok ? createTag.data : null

  const toggle = (tagSlug: string) => {
    onChange(
      selected.includes(tagSlug)
        ? selected.filter((s) => s !== tagSlug)
        : [...selected, tagSlug],
    )
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {allTags.map((tag) => {
          const active = selected.includes(tag.slug)

          return (
            <button
              key={tag.slug}
              type="button"
              onClick={() => toggle(tag.slug)}
              aria-pressed={active}
              className={
                active
                  ? 'rounded-full border border-accent bg-accent-soft px-3 py-1 text-xs text-accent'
                  : 'rounded-full border border-border px-3 py-1 text-xs text-text-muted transition-colors hover:border-accent hover:text-accent'
              }
            >
              {tag.name}
            </button>
          )
        })}

        {!isCreating && (
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="rounded-full border border-dashed border-border px-3 py-1 text-xs text-text-muted transition-colors hover:border-accent hover:text-accent"
          >
            + 新しいタグ
          </button>
        )}
      </div>

      {isCreating && (
        <div className="mt-3 rounded-md border border-border p-3">
          <div className="flex flex-wrap gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="表示名（例: アクセシビリティ）"
              className="min-w-48 flex-1 rounded-md border border-border bg-surface px-2 py-1 text-sm"
            />
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="slug（例: accessibility）"
              className="min-w-40 flex-1 rounded-md border border-border bg-surface px-2 py-1 font-mono text-sm"
            />
          </div>

          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              disabled={!name || !slug || createTag.isPending}
              onClick={() => createTag.mutate({ name, slug })}
              className="rounded-md bg-accent px-3 py-1 text-xs text-bg disabled:opacity-40"
            >
              {createTag.isPending ? '作成中…' : '作成'}
            </button>
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="text-xs text-text-muted hover:text-accent"
            >
              キャンセル
            </button>
            {createFailure && (
              <span className="text-xs text-red-500">
                {createFailure.message}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
