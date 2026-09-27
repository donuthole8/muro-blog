import { createFileRoute } from '@tanstack/react-router'
import { fetchArchivedPost } from '../lib/archive'
import { ArticleView } from '../components/articles/ArticleView'
import { articleHead } from '../lib/seo'

export const Route = createFileRoute('/posts/$slug')({
  loader: ({ params }) => fetchArchivedPost({ data: { slug: params.slug } }),
  head: ({ loaderData }) =>
    loaderData ? articleHead(loaderData) : { meta: [] },
  component: PostDetailPage,
})

function PostDetailPage() {
  const post = Route.useLoaderData()

  return <ArticleView post={post} />
}
