import { createFileRoute } from '@tanstack/react-router'
import { ArticleView } from '../components/articles/ArticleView'
import { fetchUserArticle } from '../lib/articles'
import { articleHead } from '../lib/seo'

export const Route = createFileRoute('/@{$handle}/articles/$slug')({
  loader: ({ params }) =>
    fetchUserArticle({ data: { handle: params.handle, slug: params.slug } }),
  head: ({ loaderData }) =>
    loaderData ? articleHead(loaderData) : { meta: [] },
  component: UserArticlePage,
})

function UserArticlePage() {
  const post = Route.useLoaderData()

  return <ArticleView post={post} />
}
