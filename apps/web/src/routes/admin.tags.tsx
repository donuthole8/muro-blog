import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '../components/Button'
import { createAdminTag, listAdminTags } from '../lib/admin'

/**
 * トピックタグの作成。日本語のタグ名から slug を機械的に導出できないため、
 * 名前と slug を両方入力する。投稿者はここで作られたタグから選ぶ。
 */
export const Route = createFileRoute('/admin/tags')({
  component: AdminTags,
})

function AdminTags() {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')

  const tags = useQuery({
    queryKey: ['admin', 'tags'],
    queryFn: () => listAdminTags(),
    staleTime: 0,
  })

  const create = useMutation({
    mutationFn: () => createAdminTag({ data: { name, slug } }),
    onSuccess: (result) => {
      if (!result.ok) return
      setName('')
      setSlug('')
      void queryClient.invalidateQueries({ queryKey: ['admin', 'tags'] })
      void queryClient.invalidateQueries({ queryKey: ['tags'] })
    },
  })
  const failure = create.data && !create.data.ok ? create.data : null

  return (
    <div>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          create.mutate()
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="表示名（例: アクセシビリティ）"
          className="min-w-48 flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
        />
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="slug（例: accessibility）"
          className="min-w-40 flex-1 rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-sm"
        />
        <Button type="submit" disabled={!name || !slug || create.isPending}>
          作成
        </Button>
      </form>
      {failure && (
        <p className="mt-2 text-xs text-danger">
          {Object.values(failure.errors)[0] ?? failure.message}
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        {tags.data?.map((tag) => (
          <span
            key={tag.slug}
            className="rounded-full border border-border px-3 py-1 text-xs"
          >
            {tag.name}{' '}
            <span className="font-mono text-text-muted">{tag.slug}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
