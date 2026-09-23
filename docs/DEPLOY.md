# デプロイ手順

構成は [PLAN.md](PLAN.md)（times サービス化）と [DESIGN.md](DESIGN.md) を参照。
**すべて Cloudflare の無料プランに収まり、カード登録は要らない。**
公開 URL は https://teatimes.muronaga.workers.dev （アカウントの workers.dev サブドメインは `muronaga`）。

```
[閲覧]       → web Worker（SSR）─ 公開 API の応答はエッジでキャッシュ ─┐
[ログイン中] → web Worker ─ Cookie を Bearer に載せ替え ─────────────┴→ (Service Binding) → api Worker (Hono) → D1
[旧ブログ]   → web Worker（/posts/:slug はビルド時に静的化）
[画像]       → web Worker → Workers KV
```

| Worker | ディレクトリ | 中身 |
|---|---|---|
| `teatimes-api` | `apps/api-worker` | Hono + Drizzle ORM。D1（SQLite）を読み書きする |
| `teatimes` | `apps/web` | TanStack Start。API は Service Binding（`env.API`）で呼ぶ |

## 0. 事前に必要なもの

| | 用途 | 備考 |
|---|---|---|
| Cloudflare アカウント | Workers・D1・KV | 無料。カード不要（R2 は有効化にカード登録が要るので使わない） |
| Google Cloud の OAuth クライアント | Google ログイン | OAuth クライアントの作成だけなら**課金設定は不要** |
| `wrangler` | デプロイ | 両アプリの devDependencies に含まれる |

ログインは対話が必要なので、Claude Code のプロンプトで `!` を先頭に付けて実行してください。

```sh
!pnpm --filter @blog/api-worker exec wrangler login
```

独自ドメインは**必須ではない**（`*.workers.dev` のままで公開できる）。ただし公開 API のエッジキャッシュ
（`apps/web/src/lib/edgeCache.ts`）は Cache API を使うため独自ドメインでしか効かず、
workers.dev のままだと閲覧のたびに API の Worker と D1 まで届く。無料枠（後述）には十分収まるが、
アクセスが増えてきたら独自ドメインを割り当てる。

## 1. D1（データベース）

```sh
cd apps/api-worker
pnpm exec wrangler d1 create blog
```

出力された `database_id` を `apps/api-worker/wrangler.jsonc` の `d1_databases[0].database_id` に貼る。

```sh
# スキーマを適用する（migrations/ の SQL）
pnpm db:migrate:remote
```

### 旧ブログの記事を移す

Symfony 時代の Postgres（ローカルの Docker）から、タグと記事を SQL に書き出して流し込む。

```sh
DATABASE_URL="postgresql://blog:blog@127.0.0.1:5433/blog" ./scripts/export-archive.sh > archive.sql
pnpm exec wrangler d1 execute blog --remote --file archive.sql
```

## 2. API の Worker

`apps/api-worker/wrangler.jsonc` の `vars` を本番の値にする。

| 変数 | 値 |
|---|---|
| `SITE_HOST` | サイトのホスト名（本文のリンクのうち、別タブで開かないもの） |
| `GOOGLE_CLIENT_ID` | OAuth クライアント ID |
| `GOOGLE_REDIRECT_URI` | `https://teatimes.muronaga.workers.dev/auth/callback` |

秘密情報はシークレットに入れる（`wrangler.jsonc` には書かない）。

```sh
pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET
pnpm run deploy
```

`APP_ENV` は `prod` のままにする（`dev` にすると開発用ログインとサンプルデータ投入の口が開く）。

デプロイが終わると `https://teatimes-api.muronaga.workers.dev` が払い出される。動作確認:

```sh
curl https://teatimes-api.muronaga.workers.dev/api/lobby
```

### Google OAuth クライアント

1. Google Cloud コンソール →「API とサービス」→「認証情報」→「OAuth クライアント ID を作成」
2. 種類は「ウェブ アプリケーション」
3. 承認済みのリダイレクト URI に `https://teatimes.muronaga.workers.dev/auth/callback` を登録
   （ローカル用に `http://localhost:3100/auth/callback` も足してよい）
4. 同意画面のスコープは `openid` と `profile` だけ（メールアドレスは取らない）

## 3. web の Worker

### 環境変数のスコープに注意

| 読む場所 | 供給元 | 該当するもの |
|---|---|---|
| ビルド中（プリレンダリング・OGP 画像の生成） | `apps/web/.env` | `API_BASE_URL`、`SITE_URL` |
| デプロイ後の Worker | `wrangler.jsonc` の `vars` と `services` | `SITE_URL`、API の呼び出し（`env.API`） |

デプロイ後の Worker は `API_BASE_URL` を使わず、Service Binding で API を呼ぶ。
workers.dev 上の Worker から同じアカウントの別の Worker を URL で fetch すると弾かれる（エラー 1042）ため。
ビルドは手元で動くので、`.env` の `API_BASE_URL` に workers.dev の URL を入れて本番の記事を読ませる。

セッション Cookie の `Secure` は `SITE_URL` が `https://` で始まるときだけ付く。

### 手順

```sh
cd apps/web

# 1. ビルド（プリレンダリング）用の値を .env に設定する
cat > .env <<'EOF'
API_BASE_URL=https://teatimes-api.muronaga.workers.dev
SITE_URL=https://teatimes.muronaga.workers.dev
EOF

# 2. デプロイ後の Worker が使う値を wrangler.jsonc の vars.SITE_URL に書く

# 3. 投稿画像の置き場（初回のみ。作成済み: id は wrangler.jsonc の kv_namespaces）
pnpm exec wrangler kv namespace create blog-images

# 4. ビルドしてデプロイ（API の Worker を先にデプロイしておくこと）
pnpm run deploy
```

独自ドメインを使う場合は、Cloudflare にドメインを追加してから、Worker の設定画面で
カスタムドメインを割り当てる。

## 4. 最初の管理者を任命する

管理画面（`/admin`）は `role=admin` のユーザーだけが開ける。最初の1人は画面から作れないので、
本人が Google でログインして handle を決めたあと、本番 DB に対して実行する。

```sh
cd apps/api-worker
pnpm exec wrangler d1 execute blog --remote \
  --command "UPDATE users SET role = 'admin' WHERE handle = '<handle>'"
```

## 5. 無料枠の目安

| | 無料枠 | このサービスでの使い方 |
|---|---|---|
| Workers | 10 万リクエスト/日、CPU 10ms/リクエスト | 閲覧1回で web と API の両方が動く。公開 API はエッジでキャッシュされると API まで届かない |
| D1 | 読み取り 500 万行/日、書き込み 10 万行/日、5GB | 読み取りは「走査した行数」で数える。検索の `LIKE` は全件走査 |
| Workers KV | 保存 1GB、書き込み 1,000 回/日、読み取り 10 万回/日 | 投稿画像。ブラウザで 1 枚 500KB 程度まで縮めてから送る（`apps/web/src/lib/image.ts`） |

Cloudflare のダッシュボード（Workers & Pages → 各 Worker / D1 → Metrics）で使用量を確認できる。
上限を超えても課金はされず、その日の残りはエラーになる。

- 検索が重くなったら FTS5 の仮想テーブルを足す
- Markdown の変換は投稿時に1回だけ行って `body_html` に保存している（CPU 10ms を守るため）
- リンクカードの取得（外部への通信）は `ctx.waitUntil` でレスポンスの後に行う

## 6. 旧ブログの記事を直したとき

アーカイブ（`/posts/:slug`）はビルド時に静的化しているので、再デプロイで反映される。

```sh
cd apps/web && pnpm run deploy
```

## チェックリスト

- [ ] `wrangler login`
- [ ] D1 作成、`database_id` を `apps/api-worker/wrangler.jsonc` に反映
- [ ] マイグレーション適用（`pnpm db:migrate:remote`）
- [ ] 旧ブログの記事を移す（`scripts/export-archive.sh`）
- [ ] Google OAuth クライアント作成（リダイレクト URI を登録）
- [ ] API の `vars` を本番の値に、`GOOGLE_CLIENT_SECRET` をシークレットに
- [ ] API の Worker をデプロイ
- [ ] KV namespace 作成
- [ ] web の `.env`（ビルド用）と `wrangler.jsonc` の `vars.SITE_URL` を更新
- [ ] web の Worker をデプロイ
- [ ] 最初の管理者を任命
