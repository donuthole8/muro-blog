# times

誰でも自分の times（分報）を持てるサービス。個人ブログから作り替えた。
計画は [docs/PLAN.md](docs/PLAN.md)、元の設計は [docs/DESIGN.md](docs/DESIGN.md) を参照。

## 構成

| ディレクトリ | 中身 |
|---|---|
| `apps/api` | Symfony 7.4 + NelmioApiDocBundle + Doctrine（PostgreSQL） |
| `packages/api-client` | OpenAPI spec → TypeScript 型 → 型付きクライアント |
| `apps/web` | TanStack Start + TanStack Query（公開ページ + 管理画面） |

## 前提ツール

- PHP 8.3 / Composer
- Docker（開発用 Postgres）
- Node 22（nvm 側）

### pnpm について

このマシンには **nodebrew と nvm が両方入っており、PATH 上で nodebrew が先**にあるため、
`pnpm` と打つと古い pnpm 6.11.0 が起動する（`node` は nvm の v22 が使われる）。

当面は nvm 側の corepack を明示的に使う:

```sh
alias pnpm='/Users/murohisashimasakado/.nvm/versions/node/v22.23.2/bin/corepack pnpm'
```

恒久対応は `~/.zshrc` から nodebrew の PATH を外すこと（要判断）。

## 開発の始め方

**リポジトリのルートで1コマンド。** DB・API・フロントエンドがまとめて立ち上がる。

```sh
pnpm dev
```

```
  times     http://localhost:3100
  ログイン  http://localhost:3100/dev-login （Google 未設定時の開発用）
  API ドキュメント  http://127.0.0.1:8000/api/doc
```

Ctrl+C で全て停止する（DB コンテナだけは残る）。

初回のみ、環境変数ファイルの用意と DB のスキーマ適用・サンプルデータ投入が必要:

```sh
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

cd apps/api
php bin/console doctrine:migrations:migrate --no-interaction
php bin/console app:seed            # 任意。alice / bob / carol と投稿を作る
php bin/console app:user:role alice # 任意。alice を管理者にする
```

### ログイン

本番は Google ログインのみ。ローカルで Google OAuth を設定していない場合
（`apps/api/.env` の `GOOGLE_CLIENT_ID` が空）は、「ログイン」を押すと
開発用ログイン画面（`/dev-login`）に回され、handle を入れるだけでその人としてログインできる。
これは API が `APP_ENV=dev` かつ `DEV_LOGIN_ENABLED=1` のときだけ動く。

Google ログインをローカルで試すときは、Google Cloud Console で OAuth クライアント ID を作り、
承認済みのリダイレクト URI に `http://localhost:3100/auth/callback` を登録して、
`apps/api/.env` の `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` を埋める。

### 個別に起動したい場合

```sh
cd apps/api && docker compose up -d                      # DB
php -S 127.0.0.1:8000 -t public public/index.php         # API
cd apps/web && pnpm dev                                   # フロント (:3100)
```

## つまずいたら

### ページが 500 になる / "Network connection lost" と出る

**Symfony API（8000番）が起動していない。** フロントエンドは投稿を API から
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

静的化（プリレンダリング）するのは旧ブログのアーカイブ記事（`/posts/:slug`）と
`rss.xml`・`robots.txt` だけ。times の画面はすべて SSR で、公開 API の応答を
Cloudflare のエッジでキャッシュする（`apps/web/src/lib/edgeCache.ts`）。
**ビルド中は Symfony API が起動している必要がある**（アーカイブ記事の一覧を取るため）。

環境変数は `apps/web/.env.example` を参照。

## 管理画面

`http://localhost:3100/admin`（`role=admin` のユーザーだけが開ける）

- 投稿の非表示・非表示の解除・削除（非表示の投稿も本文ごと見える）
- ユーザーの停止・停止の解除（停止すると全端末からログアウトし、投稿は一覧から消える）
- トピックタグの作成

管理者は `php bin/console app:user:role <handle>` で任命する（`--revoke` で外す）。
権限は API 側（`/api/admin` は `ROLE_ADMIN` のみ）で判定している。

## OpenAPI から型を再生成する

API のエンドポイントや DTO を変えたら必ず実行する。

```sh
cd packages/api-client
pnpm run sync     # spec ダンプ + 型生成
pnpm exec tsc --noEmit
```

## 疎通確認

API のみ（Symfony を起動し、`DEV_LOGIN_ENABLED=1` の状態で）:

```sh
cd packages/api-client && pnpm exec tsx scripts/smoke.ts
```

ロビーの取得 → 開発用ログイン → 投稿 → リアクション → スレッドの取得 → 削除 →
バリデーションエラーまでを、生成した型付きクライアントで通しで確認する。

## エンドポイント

全体は `http://127.0.0.1:8000/api/doc`（Swagger UI）を参照。

### 公開（認証不要・エッジでキャッシュされる）

| メソッド | パス | キャッシュ |
|---|---|---|
| GET | `/api/lobby?cursor=` | 15 秒 |
| GET | `/api/rooms/popular` | 5 分 |
| GET | `/api/users/{handle}` / `/api/users/{handle}/posts?cursor=` | 15 秒 |
| GET | `/api/posts/{id}`（親投稿＋返信） | 15 秒 |
| GET | `/api/tags` / `/api/tags/{slug}/posts?cursor=` | 5 分 / 15 秒 |
| GET | `/api/orgs/{slug}/users` | 5 分 |
| GET | `/api/archive/posts` / `/api/archive/posts/{slug}` / `/api/archive/tags` | 1 時間 |

### ログインが必要（`Authorization: Bearer <セッショントークン>`）

| メソッド | パス |
|---|---|
| GET / PUT / DELETE | `/api/me`（DELETE は退会） |
| GET | `/api/me/viewer-state?postIds=&handle=` |
| POST | `/api/posts`（`parentId` を付ければ返信） |
| GET | `/api/posts/{id}/source`（編集用の Markdown。本人のみ） |
| PUT / DELETE | `/api/posts/{id}` |
| PUT / DELETE | `/api/posts/{id}/reactions/{emoji}` |
| PUT / DELETE | `/api/follows/{handle}` |
| POST | `/api/follows/{handle}/read` |
| GET | `/api/following` |
| GET | `/api/notifications?cursor=` |
| POST | `/api/notifications/read` |

### 管理（`role=admin` のみ）

| メソッド | パス |
|---|---|
| GET | `/api/admin/posts?cursor=&handle=` |
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
| DELETE | `/api/auth/session` |
| POST | `/api/auth/dev-login`（開発時のみ） |
