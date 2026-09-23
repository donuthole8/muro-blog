# times サービス化 計画

個人ブログを、誰でも自分の times（分報）を持てる一般公開サービスに作り替える。
既存の設計は [DESIGN.md](DESIGN.md) を参照。本書はそこからの変更点をまとめる。

## 1. コンセプト

- **1ユーザー1部屋**の times。Slack の `#times-xxx` 文化をオープンにしたもの
- 自分の部屋では独り言を書き、他人の部屋に遊びに行ってスレッドで返信する
- 会社は「所属」にすぎない。times は人に紐づき、転職しても残る

## 2. 決定事項

| 項目 | 決定 |
|---|---|
| 対象 | 一般公開 SNS |
| 登録 | **Google OAuth のみ**（パスワード管理なし） |
| 中心体験 | 個人の部屋型（1ユーザー1部屋） |
| 公開範囲 | 全投稿公開（`visibility` なし） |
| 投稿 | Markdown / 2000字 / 画像1枚 / 編集・削除可（編集済み表示あり） |
| 投稿 UI | 専用画面は作らない。画面下部の入力欄、またはモーダル |
| スレッド | 1階層（Slack 式）。部屋には親投稿だけが流れ、返信数を表示 |
| 鮮度 | 画面表示時・タブ復帰時に再取得。常時ポーリングはしない。自分の投稿は楽観的更新 |
| 通知 | アプリ内のベルのみ（返信・メンション・リアクション） |
| 会社 | プロフィールの自己申告（未認証表示）。認証・承認の仕組みは作らない |
| 記事 | 新規の記事投稿は当面なし。既存記事は `/posts/:slug` に静的アーカイブとして残す |
| インフラ | Symfony + Cloud Run（scale-to-zero）+ Neon。**無料枠を守る** |
| 荒らし対策 | 後回し。ただし §6 の最低限だけは入れる（要確認） |

## 3. 部屋を見つけてもらう入口（MVP に全部入れる）

| 入口 | 実装方針 | キャッシュ |
|---|---|---|
| 新着ロビー `/` | 全ユーザーの親投稿を新しい順に | エッジで 10〜15 秒 |
| トピックタグ `/tags/:slug` | 既存の `Tag` を流用し、投稿に付ける | エッジで 10〜15 秒 |
| 人気の部屋 | 過去 24h のリアクション数＋返信数を部屋ごとに SQL 集計。定期バッチは作らない | エッジで 5 分 |
| 会社 `/org/:name` | 会社名（正規化したもの）が一致するユーザーの部屋一覧。「自己申告に基づく一覧です」と明記 | エッジで 5 分 |
| 部屋のフォロー | **フォロー中の部屋一覧と未読数だけ**を出す。フォローした人の投稿を混ぜたフィードは作らない（人ごとに内容が変わりキャッシュできないため） | なし（ログイン時のみ） |

## 4. 無料枠を守るための原則

- **Neon を眠らせる。** 常時ポーリングが DB まで届くとコンピュートが止まらず、無料枠を超える
  - 公開 GET には `Cache-Control: public, s-maxage=…` を付け、Cloudflare のエッジで吸収する
  - 全投稿が公開なので、ログインしていないときの応答は全員に同じものを返せる
  - ログイン中の人ごとの情報（未読数・自分のリアクション状態）は別エンドポイントに分けて取得する
- Cloud Run のコールドスタートは受け入れる（`min-instances=0` のまま）
- 画像は R2 に置く（無料枠 10GB）。サイズの上限と縮小は投稿時に処理する
- リンクカードの取得は投稿時に同期で行わず、後から非同期で埋める

## 5. データモデル

```
User
  id (ULID), google_sub (unique), handle (unique), display_name,
  avatar_url, bio, company_name (自己申告・任意), company_slug (正規化),
  role (user|admin), suspended_at, created_at

Post
  id (ULID), author_id → User, parent_id → Post (NULL なら親投稿),
  body_markdown, body_html, image_key, reply_count, reaction_count,
  last_reply_at, edited_at, deleted_at, created_at
  INDEX (author_id, created_at) WHERE parent_id IS NULL   -- 部屋
  INDEX (created_at)            WHERE parent_id IS NULL   -- ロビー
  INDEX (parent_id, created_at)                           -- スレッド

PostTag      (post_id, tag_id)
Reaction     (post_id, user_id, emoji)   UNIQUE(post_id, user_id, emoji)
Follow       (follower_id, followee_id, last_read_at)
Notification (id, user_id, type[reply|mention|reaction], actor_id, post_id, read_at, created_at)

ArchivedPost ← 既存 Post をリネームして移す（読み取り専用）
```

- `parent_id` は親投稿だけを指せる（返信への返信は禁止）。1階層に固定する
- `reply_count` と `reaction_count` は非正規化したカウンタ。一覧表示のたびに COUNT しない
- 論理削除した親投稿は「削除されました」と表示し、スレッドの返信は残す

## 6. 荒らし対策の最低限

一般公開サービスで運営者が投稿を消せないと、削除依頼に対応できない
（情報流通プラットフォーム対処法など）。そのため次の2つだけは MVP に入れる。

- 管理者による投稿の非表示・削除
- 管理者によるユーザーの停止（`suspended_at`）

既存の `/admin` を流用する。

公開前に、次のものも追加した（issue #1〜#4）。

| 対策 | 内容 |
|---|---|
| レート制限 | ユーザー単位の sliding window。登録から24時間以内のアカウントは厳しい方を使う（`config/packages/rate_limiter.yaml`）。超えたら 429 と `Retry-After` を返す。状態は DB の `cache_items` に置き、Cloud Run のインスタンス間で共有する |
| 画像アップロードの制限 | Worker は R2 に置く前に `POST /api/me/uploads` を呼び、200 が返ったときだけ保存する |
| 通報 | `POST /api/posts/{id}/report`（1人1投稿1件）。`/admin/reports` で一覧を見て、非表示・削除すれば自動で対応済みになり、問題なければ却下する |
| ブロック | `PUT/DELETE /api/blocks/{handle}`。相手は自分の投稿に返信・リアクションできず、相手からの通知も届かない。お互いのフォローは外れる。相手の投稿は viewer-state の `blockedHandles` を見て web 側で折りたたむ（公開 API はキャッシュを共有しているため、API 側では除外しない） |
| handle の予約語 | `HandlePolicy::RESERVED`。web のルート名を増やしたら、ここにも足す |

ミュート（通知を止めずに投稿だけを隠す）はまだない。

## 7. ルーティング（web）

| パス | 中身 |
|---|---|
| `/` | 新着ロビー＋人気の部屋 |
| `/@:handle` | 部屋（親投稿の時系列） |
| `/@:handle/:postId` | スレッド |
| `/tags/:slug` | タグ別の新着 |
| `/org/:companySlug` | 会社の人たちの部屋一覧 |
| `/following` | フォロー中の部屋一覧と未読数 |
| `/notifications` | 通知 |
| `/settings` | プロフィール・所属 |
| `/posts/:slug` | 旧ブログのアーカイブ（静的） |
| `/admin` | 管理画面（管理者ロールのみ） |

投稿の入力欄は、部屋とスレッドでは画面下部に固定する。それ以外の画面ではモーダルで開く。

## 8. API（追加・変更）

公開 API（キャッシュ可）
- `GET /api/lobby?cursor=`
- `GET /api/users/{handle}` / `GET /api/users/{handle}/posts?cursor=`
- `GET /api/posts/{id}`（親投稿＋返信）
- `GET /api/tags/{slug}/posts?cursor=`
- `GET /api/rooms/popular`
- `GET /api/orgs/{slug}/users`

ログインが必要な API
- `GET /api/me` / `PUT /api/me`
- `POST /api/posts` / `PUT /api/posts/{id}` / `DELETE /api/posts/{id}`（`parent_id` を付ければ返信）
- `PUT /api/posts/{id}/reactions/{emoji}` / `DELETE` 同
- `PUT /api/follows/{handle}` / `DELETE` 同 / `GET /api/following`
- `GET /api/notifications` / `POST /api/notifications/read`
- `GET /api/me/viewer-state?postIds=`（自分がリアクション済みかどうかなど、人ごとの情報）

ページングはオフセットではなくカーソル方式にする（ULID の降順）。

## 9. 実装フェーズ

### Phase 1: 土台
1. Google OAuth（`knpuniversity/oauth2-client-bundle`）とセッション Cookie
2. 初回ログイン時の `handle` 決定画面
3. `X-Admin-Token` を `role=admin` に置き換え
4. 既存の `Post` を `ArchivedPost` に移し、新しい `Post` を作成（マイグレーション）
5. web のプリレンダリングを `/posts/:slug` のアーカイブだけに限定し、他は SSR にする

### Phase 2: times の核
6. 部屋・ロビー・スレッドの表示
7. 下部入力欄とモーダルでの投稿、楽観的更新、編集・削除
8. 画像アップロード（既存の uploads を R2 に対応させる）
9. リアクション（既存の EmojiPicker を流用）
10. 公開 GET のキャッシュヘッダを付け、Neon が眠ることを確認する

### Phase 3: 部屋を見つけてもらう入口と通知
11. タグ付け、タグ別の新着
12. フォロー（一覧と未読数）
13. 人気の部屋
14. 会社の自己申告と `/org/:slug`
15. 通知ベル（返信・メンション・リアクション）

### Phase 4: 公開前の最低限
16. 管理者による投稿非表示とユーザー停止
17. 利用規約・プライバシーポリシー・退会（データ削除）
18. OGP（部屋とスレッドの共有カード）

### 次フェーズ以降
- 荒らし対策：新規アカウントのレート制限、通報、ミュート・ブロック
- 記事機能の復活：タイトルを付けたら記事として扱う
- **times を記事にまとめる機能**：スレッドや1週間分の投稿を選び、AI で記事の下書きを作る
- 今の状態表示（作業中・集中・もくもく中）、日報・週報の自動生成、草グラフ
- Slack・Discord の times のインポート
- 会社メールドメインによる所属認証（信頼できる会社ページが必要になったら）
- Web Push 通知、スレッドを開いている間だけの短い間隔の更新

## 10. 未決事項

- サービス名とドメイン
- 既存記事のアーカイブを自分の部屋からリンクするか

（解決済み: handle の予約語 → §6、荒らし対策の最低限 → §6、退会ユーザーの返信 → §11）

## 11. 退会したユーザーの投稿の扱い

**匿名化して残すのではなく、本文を消す**方針にする。「退会したらデータが消える」ことを
約束するほうが、スレッドの読みやすさより優先度が高いため。実装は `AccountDeleter`。

| 対象 | 退会後 |
|---|---|
| 退会者の親投稿（返信なし） | 論理削除。部屋・ロビーから消え、スレッドの URL も 404 になる |
| 退会者の親投稿（他人の返信あり） | 本文・画像を消し「この投稿は削除されました」と出す。**他人の返信は残す**（他人が書いたものは消さない）。投稿者名は出さない |
| 退会者が他人のスレッドに付けた返信 | 論理削除。スレッドから消え、親投稿の返信数も減る |
| 画像 | R2 から削除する（API が返したキーを Worker が消す） |
| リアクション・フォロー・ブロック・通知・セッション | 行ごと削除 |
| 退会者が出した通報 | 管理上の記録として残す。通報者は「退会したユーザー」と表示される |
| ユーザーの行 | 残す（他人のスレッドの外部キーのため）。Google の ID・handle・プロフィールは消す |
| handle | 解放し、別の人が取れるようにする |

handle を解放するので、退会者のスレッドの古い URL（`/@旧handle/:id`）の `旧handle` は、
別の人の部屋を指すことがある。そのためスレッド画面では、持ち主がいない（退会済みの）スレッドに
部屋へのリンクを出さない。
