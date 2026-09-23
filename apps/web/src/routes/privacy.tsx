import { createFileRoute } from '@tanstack/react-router'
import { site } from '../lib/site'

/*
 * プライバシーポリシーのひな形。公開前に内容を確認すること。
 * 実際に取得・保存しているもの（apps/api の User エンティティ）と食い違わないよう、
 * 項目を増やしたらここも直す。
 */
export const Route = createFileRoute('/privacy')({
  head: () => ({
    meta: [
      { title: `プライバシーポリシー | ${site.title}` },
      {
        name: 'description',
        content: `${site.title}のプライバシーポリシーです。`,
      },
    ],
  }),
  component: Privacy,
})

function Privacy() {
  return (
    <article className="prose prose-blog max-w-none">
      <h1>プライバシーポリシー</h1>

      <h2>取得する情報</h2>
      <ul>
        <li>
          Google アカウントの識別子（sub）、名前、プロフィール画像の URL。
          <strong>メールアドレスは取得・保存しません。</strong>
        </li>
        <li>利用者が入力した handle、表示名、自己紹介、所属（自己申告）</li>
        <li>投稿（本文・画像）、リアクション、フォロー、通知</li>
        <li>ログイン状態を保つための Cookie（セッション）</li>
      </ul>

      <h2>利用目的</h2>
      <ul>
        <li>本サービスの提供（部屋・投稿・通知の表示など）</li>
        <li>不正利用への対応、規約違反の投稿の削除</li>
      </ul>

      <h2>公開される情報</h2>
      <p>
        handle、表示名、プロフィール画像、自己紹介、所属、投稿、リアクションは誰でも閲覧できます。
        所属は同じ会社名を書いた人どうしの一覧（/org/会社名）にも表示されます。
      </p>

      <h2>外部サービス</h2>
      <p>
        本サービスは Google（ログイン）、Cloudflare（配信・画像の保存）、Google
        Cloud（API）、
        Neon（データベース）を利用しており、情報はこれらの事業者の設備に保存されます。
      </p>

      <h2>削除</h2>
      <p>
        設定画面から退会すると、投稿の本文・画像（他の利用者のスレッドへの返信を含む）、リアクション、フォロー、ブロック、通知、ログイン情報を削除します。
        他の利用者があなたの投稿に付けた返信は、その利用者の投稿として残ります。
        あなたが送った通報は、不正利用への対応の記録として、あなたを特定できない形で保存します。
      </p>

      <h2>お問い合わせ</h2>
      <p>連絡先: 未定（公開時に記入）</p>
    </article>
  )
}
