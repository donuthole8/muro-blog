import { createFileRoute } from '@tanstack/react-router'
import { site } from '../lib/site'

export const Route = createFileRoute('/about')({
  head: () => ({
    meta: [
      { title: `${site.title} について` },
      { name: 'description', content: site.description },
    ],
  }),
  component: About,
})

function About() {
  return (
    <div className="prose prose-blog max-w-none">
      <h1>{site.title} について</h1>
      <p>{site.description}</p>

      <h2>使い方</h2>
      <ul>
        <li>ひとり1部屋。自分の部屋では独り言を書きます。</li>
        <li>
          人の部屋に遊びに行って、スレッドで返信します（スレッドは1階層）。
        </li>
        <li>気になる部屋はフォローすると、新しい投稿の数が分かります。</li>
        <li>
          会社は「所属」にすぎません。times
          は人に紐づくので、転職しても残ります。
        </li>
      </ul>

      <h2>しくみ</h2>
      <ul>
        <li>バックエンド: Symfony + NelmioApiDocBundle + PostgreSQL（Neon）</li>
        <li>
          フロントエンド: TanStack Start + TanStack Query（Cloudflare Workers）
        </li>
        <li>型の受け渡し: OpenAPI → openapi-typescript → openapi-fetch</li>
      </ul>
    </div>
  )
}
