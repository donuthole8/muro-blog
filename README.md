# teatimes

誰でも自分の times（分報）を持てるサービス。個人ブログから作り替えた。
計画は [docs/PLAN.md](docs/PLAN.md)、元の設計は [docs/DESIGN.md](docs/DESIGN.md) を参照。

## 構成

| ディレクトリ | 中身 |
|---|---|
| `apps/api-worker` | Hono + Drizzle ORM + Cloudflare D1（Workers で動く API） |
| `packages/api-client` | OpenAPI spec（`openapi.json`）→ TypeScript 型 → 型付きクライアント |
| `apps/web` | TanStack Start + TanStack Query（公開ページ + 管理画面） |

すべて Cloudflare（Workers・D1・KV）の無料プランで動く。デプロイは [docs/DEPLOY.md](docs/DEPLOY.md)。

## 前提ツール

- Node 22（nvm 側）

PHP・Docker は不要（D1 はローカルでは SQLite ファイルとして動く）。

### pnpm について

このマシンには **nodebrew と nvm が両方入っており、PATH 上で nodebrew が先**にあるため、
`pnpm` と打つと古い pnpm 6.11.0 が起動する（`node` は nvm の v22 が使われる）。

当面は nvm 側の corepack を明示的に使う:

```sh
alias pnpm='/Users/murohisashimasakado/.nvm/versions/node/v22.23.2/bin/corepack pnpm'
```

恒久対応は `~/.zshrc` から nodebrew の PATH を外すこと（要判断）。

## 開発の始め方

**リポジトリのルートで1コマンド。** API・フロントエンドがまとめて立ち上がる（ローカルの D1 へのマイグレーションも適用する）。

```sh
pnpm dev
```

```
  times     http://localhost:3100
  ログイン  http://localhost:3100/dev-login （Google 未設定時の開発用）
  API       http://127.0.0.1:8000/api/lobby
```

Ctrl+C で全て停止する。

初回のみ、環境変数ファイルの用意が必要。サンプルデータは起動後に入れる:

```sh
cp apps/api-worker/.dev.vars.example apps/api-worker/.dev.vars
cp apps/web/.env.example apps/web/.env

# 起動後に（任意）
curl -X POST http://127.0.0.1:8000/api/dev/seed   # alice / bob / carol と投稿を作る
cd apps/api-worker && pnpm exec wrangler d1 execute blog --local \
  --command "UPDATE users SET role = 'admin' WHERE handle = 'alice'"   # alice を管理者にする
```

旧ブログの記事をローカルの D1 に入れたいときは `apps/api-worker/scripts/export-archive.sh` を使う（docs/DEPLOY.md 参照）。

### ログイン

本番は Google ログインのみ。ローカルで Google OAuth を設定していない場合
（`apps/api-worker/.dev.vars` の `GOOGLE_CLIENT_ID` が空）は、「ログイン」を押すと
開発用ログイン画面（`/dev-login`）に回され、handle を入れるだけでその人としてログインできる。
これは API が `APP_ENV=dev` かつ `DEV_LOGIN_ENABLED=1` のときだけ動く。

Google ログインをローカルで試すときは、Google Cloud Console で OAuth クライアント ID を作り、
承認済みのリダイレクト URI に `http://localhost:3100/auth/callback` を登録して、
`apps/api-worker/.dev.vars` の `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` を埋める。

### メール（確認・パスワードの再設定）

メールアドレスで登録すると確認メールが届き、リンクを開くまでは投稿・返信・リアクション・フォローができない
（ログインと handle の決定はできる）。パスワードを忘れたら、ログイン画面の「パスワードを忘れた」から
再設定のリンクを受け取る（1 時間有効。再設定すると全端末がログアウトする）。

送信には [Brevo](https://www.brevo.com/) のトランザクションメール API を使う（`apps/api-worker/src/lib/mail.ts`）。
サイトが workers.dev で独自ドメインを持たないため、ドメインの認証なしで送信者アドレス1つを確認すれば送れるものを選んだ
（無料枠 300 通/日）。`.dev.vars` の `BREVO_API_KEY` / `MAIL_FROM` が空なら送らず、
**リンクを wrangler のログに出す**（ローカルではそこから開けばよい）。
本番で未設定のときは、メールアドレスでの新規登録を受け付けない（Google では登録できる）。
メール確認を入れる前に登録していた人は、確認済みとして扱う（`migrations/0005`）。

### プッシュ通知（Web Push）

設定画面の「この端末で通知を受け取る」から、返信・メンション・リアクション・フォローをプッシュ通知で受け取れる。
暗号化（RFC 8291）と VAPID の署名は WebCrypto だけで書いている（`apps/api-worker/src/lib/webPush.ts`。
Node 向けの web-push は Workers で動かないため）。Service Worker は `apps/web/public/sw.js`。
iPhone / iPad はホーム画面に追加したとき（iOS 16.4 以降）だけ使える。

VAPID 鍵は `node apps/api-worker/scripts/generate-vapid-keys.mjs` で作り、`.dev.vars`（本番は `wrangler secret put`）に入れる。
鍵が無ければ通知を送らない。鍵を作り直すと既存の購読はすべて無効になる。

### 不適切な投稿の判定（Jev）

投稿・編集のたびに、本文を TypeSafe の [Jev](https://docs.typesafe.ai/api) に渡して
性的・暴力的・誹謗中傷・法的リスクの4つを判定する（`apps/api-worker/src/lib/moderation.ts`）。
いちばん高い確率が 0.85 以上なら自動で非表示（「この投稿は不適切なため非表示にしました」）、
0.4 以上なら畳んで出す（「この投稿は不適切な可能性があります」→ 押すと見える）。

`TYPESAFE_API_KEY`（[コンソール](https://console.typesafe.ai/) で発行）が無いとき、
Jev がエラーを返したとき（クレジット切れなど）は何もせず、そのまま投稿できる。
判定できなかった投稿と導入前の投稿は、管理画面の「未判定の投稿を判定する」で遡って判定できる。
管理者が非表示を解除すると、判定も取り消される。画像は判定しない。

### 個別に起動したい場合

```sh
cd apps/api-worker && pnpm db:migrate:local && pnpm dev   # API (:8000)
cd apps/web && pnpm dev                                    # フロント (:3100)
```

## つまずいたら

### ページが 500 になる / "Network connection lost" と出る

**API（8000番）が起動していない。** フロントエンドは投稿を API から
取得するため、API が落ちているとページを描画できない。
`pnpm dev` で両方まとめて起動すればこの状態にならない。

```sh
curl http://127.0.0.1:8000/api/lobby   # 200 が返るか確認
```

### 3101 や 3102 でサーバーが立ち上がる

前回の dev サーバーが残っていて 3100 が塞がっている。
`pnpm dev` は起動時に残骸を掃除するので、こちらを使えば起きない。

## フロントエンドを動かす

API を起動した状態で:

```sh
cd apps/web
pnpm dev            # http://localhost:3100
```

ポート 3100 を使うのは、3000 番を別プロジェクト（OpenWork Festa）が
占有しているため。

### 本番ビルド

```sh
cd apps/web
pnpm build
```

静的化（プリレンダリング）するのは `robots.txt` だけ。記事も times の画面も、
`rss.xml`・`sitemap.xml` もすべて SSR で、公開 API の応答を
Cloudflare のエッジでキャッシュする（`apps/web/src/lib/edgeCache.ts`）。
記事を公開すれば、再デプロイなしでサイトマップと RSS に載る。
**ビルド中は API が起動している必要がある**（旧ブログの記事の OGP 画像を作るために記事の一覧を取る）。

環境変数は `apps/web/.env.example` を参照。

## 管理画面

`http://localhost:3100/admin`（`role=admin` のユーザーだけが開ける）

- 投稿の非表示・非表示の解除・削除（非表示の投稿も本文ごと見える）
- ブログ記事の非表示・非表示の解除・削除（下書きも並ぶ。非表示の記事は書き手本人にだけ見える）
- ユーザーの停止・停止の解除（停止すると全端末からログアウトし、投稿は一覧から消える）
- トピックタグの作成

管理者は D1 の `users.role` を `admin` にして任命する（docs/DEPLOY.md「最初の管理者を任命する」）。
権限は API 側（`/api/admin` は `role=admin` のみ）で判定している。

## OpenAPI から型を再生成する

`packages/api-client/openapi.json` が API の形の正（旧 Symfony 版から書き出したものを引き継いだ）。
API のエンドポイントやレスポンスを変えるときは、先に `openapi.json` を直してから型を作り直す。
`apps/api-worker` は生成された型（`schema.d.ts`）でレスポンスを縛っているので、形がずれると型検査で落ちる。

```sh
cd packages/api-client
pnpm run sync     # openapi.json → schema.d.ts
pnpm -r exec tsc --noEmit
```

## 疎通確認

API のみ（API を起動し、`.dev.vars` が `APP_ENV=dev`・`DEV_LOGIN_ENABLED=1` の状態で）:

```sh
cd packages/api-client && pnpm exec tsx scripts/smoke.ts
```

ロビーの取得 → 開発用ログイン → 投稿 → リアクション → スレッドの取得 → 削除 →
バリデーションエラーまでを、生成した型付きクライアントで通しで確認する。

## エンドポイント

全体は `packages/api-client/openapi.json` を参照。

### 公開（認証不要・エッジでキャッシュされる）

| メソッド | パス | キャッシュ |
|---|---|---|
| GET | `/api/lobby?cursor=` | 15 秒 |
| GET | `/api/rooms/popular` | 5 分 |
| GET | `/api/users/{handle}` / `/api/users/{handle}/posts?cursor=` | 15 秒 |
| GET | `/api/posts/{id}`（親投稿＋返信） | 15 秒 |
| GET | `/api/tags` / `/api/tags/{slug}/posts?cursor=` | 5 分 / 15 秒 |
| GET | `/api/orgs/{slug}/users` | 5 分 |
| GET | `/api/archive/posts`（全員のブログ記事）/ `/api/archive/posts/{slug}`（旧ブログの記事）/ `/api/archive/tags` | 60 秒 |
| GET | `/api/users/{handle}/articles` / `/api/users/{handle}/articles/{slug}` | 15 秒 |
| GET | `/api/users/{handle}/activity`（部屋の活動グラフ） | 5 分 |
| GET | `/api/search?q=`（3 文字以上の語は FTS5 の trigram 索引で引く。※） | 15 秒 |
| GET | `/api/mention-candidates?q=`（メンションの補完） | 60 秒 |

※ 検索の索引 `posts_fts`（`migrations/0006`）は posts の rowid で本文と対応づけている。
D1 にデータを流し込み直した（export → import など）後は、索引を作り直す:
`wrangler d1 execute blog --remote --command "INSERT INTO posts_fts(posts_fts) VALUES('rebuild')"`。
なお `wrangler d1 export` は仮想テーブルを含む DB を書き出せないので、書き出す前に `posts_fts` を DROP し、後で 0006 の SQL を流し直す。

### ログインが必要（`Authorization: Bearer <セッショントークン>`）

| メソッド | パス |
|---|---|
| GET / PUT / DELETE | `/api/me`（DELETE は退会） |
| GET | `/api/me/viewer-state?postIds=&handle=` |
| POST | `/api/posts`（`parentId` を付ければ返信、`articleId` で記事を添付） |
| GET | `/api/posts/{id}/source`（編集用の Markdown。本人のみ） |
| PUT / DELETE | `/api/posts/{id}` |
| PUT / DELETE | `/api/posts/{id}/reactions/{emoji}` |
| PUT / DELETE | `/api/follows/{handle}` |
| POST | `/api/follows/{handle}/read` |
| GET | `/api/following` |
| GET / POST | `/api/me/articles`（自分の記事。下書きを含む） |
| GET / PUT / DELETE | `/api/me/articles/{id}` |
| POST | `/api/me/articles/preview` |
| GET | `/api/notifications?cursor=` |
| POST | `/api/notifications/read` |
| GET | `/api/me/feed?cursor=`（フォロー中の部屋の投稿。キャッシュしない） |
| POST | `/api/me/email/verification`（確認メールの再送） |
| PUT / DELETE | `/api/me/avatar`（アイコン。画像は web の Worker が KV に置く） |
| PUT / DELETE | `/api/me/status`（今の状態） |
| PUT | `/api/me/muted-words` |
| PUT / DELETE / GET | `/api/mutes/{handle}` / `/api/mutes` |
| GET | `/api/me/push-config` |
| POST / DELETE | `/api/me/push-subscriptions` |

### 管理（`role=admin` のみ）

| メソッド | パス |
|---|---|
| GET | `/api/admin/posts?cursor=&handle=` |
| GET | `/api/admin/articles?cursor=&handle=` |
| POST | `/api/admin/articles/{id}/hide` / `/unhide` |
| DELETE | `/api/admin/articles/{id}` |
| POST | `/api/admin/posts/{id}/hide` / `/unhide` |
| DELETE | `/api/admin/posts/{id}` |
| GET | `/api/admin/users?q=` |
| POST | `/api/admin/users/{id}/suspend` / `/unsuspend` |
| GET / POST | `/api/admin/tags` |

### ログイン（Worker が中継する）

| メソッド | パス |
|---|---|
| GET | `/api/auth/google/authorize` |
| POST | `/api/auth/google/callback` |
| POST | `/api/auth/email/register` / `/api/auth/email/login` |
| POST | `/api/auth/email/verify`（確認メールのリンク） |
| POST | `/api/auth/password/forgot` / `/api/auth/password/reset` |
| DELETE | `/api/auth/session` |
| POST | `/api/auth/dev-login`（開発時のみ） |
