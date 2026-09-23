import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import {
  getAdminPost,
  listAdminTags,
  setPostPublished,
  updateAdminPost,
} from '../lib/admin'
import type { PostInput } from '../lib/admin'
import { PostEditor } from '../components/admin/PostEditor'

export const Route = createFileRoute('/admin/posts/$id/edit')({
  loader: async ({ params }) => ({
    post: await getAdminPost({ data: { id: Number(params.id) } }),
    tags: await listAdminTags(),
  }),
  component: EditPost,
})

function EditPost() {
  const { post, tags } = Route.useLoaderData()
  const router = useRouter()
  const published = post.status === 'published'

  const save = useMutation({
    mutationFn: (input: PostInput) =>
      updateAdminPost({ data: { id: post.id, post: input } }),
    onSuccess: (result) => {
      if (result.ok) router.invalidate()
    },
  })

  const togglePublish = useMutation({
    mutationFn: () =>
      setPostPublished({ data: { id: post.id, published: !published } }),
    onSuccess: () => router.invalidate(),
  })

  const failure = save.data && !save.data.ok ? save.data : null
  const saved = save.data?.ok === true && !save.isPending

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="flex-1 text-lg font-bold">記事を編集</h1>
        {published && (
          <Link
            to="/posts/$slug"
            params={{ slug: post.slug }}
            className="text-xs text-accent hover:underline"
          >
            公開ページを見る →
          </Link>
        )}
      </div>

      {failure && Object.keys(failure.errors).length === 0 && (
        <p className="mb-4 rounded-md border border-red-500/40 px-3 py-2 text-sm text-red-500">
          {failure.message}
        </p>
      )}

      {saved && (
        <p className="mb-4 rounded-md border border-accent/40 bg-accent-soft px-3 py-2 text-sm text-accent">
          保存しました。
        </p>
      )}

      <PostEditor
        // 保存後に loader が返す最新値で内部 state を作り直す
        key={post.updatedAt}
        initial={{
          title: post.title,
          slug: post.slug,
          emoji: post.emoji ?? null,
          bodyMd: post.bodyMd,
          excerpt: post.excerpt,
          tagSlugs: post.tags.map((tag) => tag.slug),
        }}
        allTags={tags}
        errors={failure?.errors ?? {}}
        isSaving={save.isPending}
        statusSlot={
          <>
            <button
              type="button"
              disabled={togglePublish.isPending}
              onClick={() => togglePublish.mutate()}
              className="rounded-md border border-border px-3 py-2 text-sm text-text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
            >
              {published ? '下書きに戻す' : '公開する'}
            </button>
            <span className="text-xs text-text-muted">
              {published ? '公開中' : '下書き'}
            </span>
          </>
        }
        onSubmit={(input) => save.mutate(input)}
      />
    </div>
  )
}
