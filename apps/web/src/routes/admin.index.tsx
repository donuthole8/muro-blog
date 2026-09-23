import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { deleteAdminPost, listAdminPosts, setPostPublished } from '../lib/admin'
import { formatDate } from '../lib/format'
import { DEFAULT_EMOJI } from '../lib/emoji'

export const Route = createFileRoute('/admin/')({
  loader: () => listAdminPosts({ data: {} }),
  component: AdminPostList,
})

function AdminPostList() {
  const posts = Route.useLoaderData()
  const router = useRouter()

  const togglePublish = useMutation({
    mutationFn: (input: { id: number; published: boolean }) =>
      setPostPublished({ data: input }),
    onSuccess: () => router.invalidate(),
  })

  const remove = useMutation({
    mutationFn: (id: number) => deleteAdminPost({ data: { id } }),
    onSuccess: () => router.invalidate(),
  })

  if (posts.length === 0) {
    return (
      <p className="text-sm text-text-muted">
        まだ記事がありません。「+ 新規投稿」から書き始めてください。
      </p>
    )
  }

  return (
    <div className="divide-y divide-border">
      {posts.map((post) => {
        const published = post.status === 'published'

        return (
          <div key={post.id} className="flex flex-wrap items-center gap-3 py-3">
            <span
              className={
                published
                  ? 'rounded px-1.5 py-0.5 text-[0.65rem] font-bold text-accent bg-accent-soft'
                  : 'rounded border border-border px-1.5 py-0.5 text-[0.65rem] text-text-muted'
              }
            >
              {published ? '公開' : '下書き'}
            </span>

            <Link
              to="/admin/posts/$id/edit"
              params={{ id: String(post.id) }}
              className="flex-1 truncate text-sm font-bold transition-colors hover:text-accent"
            >
              <span aria-hidden className="mr-1.5">
                {post.emoji || DEFAULT_EMOJI}
              </span>
              {post.title}
            </Link>

            <time className="font-mono text-xs text-text-muted">
              {formatDate(post.updatedAt)}
            </time>

            <button
              type="button"
              disabled={togglePublish.isPending}
              onClick={() =>
                togglePublish.mutate({ id: post.id, published: !published })
              }
              className="rounded-md border border-border px-2 py-1 text-xs text-text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
            >
              {published ? '下書きに戻す' : '公開する'}
            </button>

            <button
              type="button"
              disabled={remove.isPending}
              onClick={() => {
                if (
                  confirm(`「${post.title}」を削除します。よろしいですか？`)
                ) {
                  remove.mutate(post.id)
                }
              }}
              className="text-xs text-text-muted transition-colors hover:text-red-500 disabled:opacity-40"
            >
              削除
            </button>
          </div>
        )
      })}
    </div>
  )
}
