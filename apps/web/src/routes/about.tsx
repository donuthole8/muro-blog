import { createFileRoute } from '@tanstack/react-router'
import { site } from '../lib/site'

export const Route = createFileRoute('/about')({
  head: () => ({
    meta: [
      { title: `about | ${site.title}` },
      {
        name: 'description',
        content: `${site.title}の運営者情報と技術スタックについて。`,
      },
    ],
  }),
  component: About,
})

function About() {
  return (
    <div className="prose prose-blog max-w-none">
      <h1>about</h1>
      <p>{site.description}</p>

      <h2>このサイトについて</h2>
      <ul>
        <li>バックエンド: Symfony + NelmioApiDocBundle + PostgreSQL</li>
        <li>フロントエンド: TanStack Start + TanStack Query</li>
        <li>型の受け渡し: OpenAPI → openapi-typescript → openapi-fetch</li>
        <li>ホスティング: Cloudflare Workers / Google Cloud Run</li>
      </ul>
    </div>
  )
}
