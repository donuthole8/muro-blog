# blog

個人ブログ。設計は [docs/DESIGN.md](docs/DESIGN.md) を参照。

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
  ブログ    http://localhost:3100
  管理画面  http://localhost:3100/admin
  API ドキュメント  http://127.0.0.1:8000/api/doc
```

Ctrl+C で全て停止する（DB コンテナだけは残る）。

初回のみ、DB のスキーマ適用とサンプルデータ投入が必要:

```sh
cd apps/api
php bin/console doctrine:migrations:migrate --no-interaction
php bin/console app:seed          # 任意
```

### 個別に起動したい場合

```sh
cd apps/api && docker compose up -d                      # DB
php -S 127.0.0.1:8000 -t public public/index.php         # API
cd apps/web && pnpm dev                                   # フロント (:3100)
```

## つまずいたら

### ページが 500 になる / "Network connection lost" と出る

**Symfony API（8000番）が起動していない。** フロントエンドは記事を API から
取得するため、API が落ちているとページを描画できない。
`pnpm dev` で両方まとめて起動すればこの状態にならない。

```sh
curl http://127.0.0.1:8000/api/posts   # 200 が返るか確認
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

### 本番ビルド（プリレンダリング）

```sh
cd apps/web
pnpm build
```

`/` から始めてリンクを辿り、記事詳細・タグ別一覧まで自動的に静的化する。
**ビルド中は Symfony API が起動している必要がある。**
出力は `dist/client/` に静的 HTML + `sitemap.xml` + `rss.xml`。

環境変数は `apps/web/.env.example` を参照。

## 管理画面

`http://localhost:3100/admin`

- 記事一覧（下書き含む）・公開/下書きの切り替え・削除
- 新規投稿 / 編集（Markdown + ライブプレビュー）
- 記事のアイキャッチ絵文字の設定（候補から選ぶ / 検索 / ランダム / 直接貼り付け）
- タグの選択と新規作成

プレビューは API の `POST /api/admin/preview` を呼んでいる。
ブラウザ側で別の Markdown ライブラリを使うと保存後の表示とズレるため、
**保存時と同じ変換器**を通した結果を表示している。

Phase 1 ではローカル起動のみを想定しており、認証は持たない。
API 側は `X-Admin-Token` で保護されており、
トークンはサーバー関数の中だけで扱われるのでブラウザには出ない。

## OpenAPI から型を再生成する

API のエンドポイントや DTO を変えたら必ず実行する。

```sh
cd packages/api-client
pnpm run sync     # spec ダンプ + 型生成
pnpm exec tsc --noEmit
```

## 疎通確認

API のみ（Symfony を起動した状態で）:

```sh
cd packages/api-client && pnpm exec tsx scripts/smoke.ts
```

管理画面のミューテーション経路（API と dev サーバーを起動した状態で）:

```sh
cd apps/web && node scripts/admin-smoke.mjs 3100   # 引数は dev サーバーのポート
```

ブラウザと同じ seroval 形式でサーバー関数を直接叩き、
プレビュー・作成・バリデーション・公開・公開 API への反映・削除を通しで確認する。

## エンドポイント

### 公開（認証不要・読み取りのみ）

| メソッド | パス |
|---|---|
| GET | `/api/posts?page=&perPage=&tag=` |
| GET | `/api/posts/{slug}` |
| GET | `/api/tags` |

### 管理（`X-Admin-Token` ヘッダーが必要）

| メソッド | パス |
|---|---|
| GET / POST | `/api/admin/posts` |
| GET / PUT / DELETE | `/api/admin/posts/{id}` |
| POST | `/api/admin/posts/{id}/publish` |
| POST | `/api/admin/posts/{id}/unpublish` |
| GET / POST | `/api/admin/tags` |
| POST | `/api/admin/preview` |

トークンは `apps/api/.env` の `ADMIN_TOKEN`（開発値: `dev-local-token`）。
