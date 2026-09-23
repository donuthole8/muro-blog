import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { createAdminPost, listAdminTags } from '../lib/admin'
import type { PostInput } from '../lib/admin'
import { DEFAULT_EMOJI } from '../lib/emoji'
import { PostEditor } from '../components/admin/PostEditor'

export const Route = createFileRoute('/admin/posts/new')({
  loader: () => listAdminTags(),
  component: NewPost,
})

const emptyPost: PostInput = {
  title: '',
  slug: '',
  emoji: DEFAULT_EMOJI,
  bodyMd: '',
  excerpt: null,
  tagSlugs: [],
}

function NewPost() {
  const allTags = Route.useLoaderData()
  const navigate = useNavigate()

  const create = useMutation({
    mutationFn: (input: PostInput) => createAdminPost({ data: input }),
    onSuccess: (result) => {
      if (result.ok) {
        navigate({
          to: '/admin/posts/$id/edit',
          params: { id: String(result.post.id) },
        })
      }
    },
  })

  const failure = create.data && !create.data.ok ? create.data : null

  return (
    <div>
      <h1 className="mb-5 text-lg font-bold">新規投稿</h1>

      {failure && Object.keys(failure.errors).length === 0 && (
        <p className="mb-4 rounded-md border border-red-500/40 px-3 py-2 text-sm text-red-500">
          {failure.message}
        </p>
      )}

      <PostEditor
        initial={emptyPost}
        allTags={allTags}
        errors={failure?.errors ?? {}}
        isSaving={create.isPending}
        onSubmit={(input) => create.mutate(input)}
      />
    </div>
  )
}
