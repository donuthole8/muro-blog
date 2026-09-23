# デプロイ手順

構成は [PLAN.md](PLAN.md)（times サービス化）と [DESIGN.md](DESIGN.md) を参照。

```
[閲覧]       → Cloudflare Workers（SSR）─ 公開 API の応答はエッジでキャッシュ ─┐
[ログイン中] → Cloudflare Workers ─ Cookie を Bearer に載せ替え ──────────┴→ Cloud Run (Symfony) → Neon
[旧ブログ]   → Cloudflare Workers（/posts/:slug はビルド時に静的化）
```

## 0. 事前に必要なもの

| | 用途 | 備考 |
|---|---|---|
| Neon アカウント | PostgreSQL | 無料。カード不要 |
| Google Cloud アカウント | Cloud Run | **カード登録が必須**（無料枠内なら課金されない） |
| Cloudflare アカウント | Workers・R2 | 無料。カード不要。**独自ドメインが必要**（後述） |
| Google Cloud の OAuth クライアント | Google ログイン | Cloud Run と同じプロジェクトで作ればよい |
| `gcloud` CLI | デプロイ | 未インストール |
| `wrangler` | デプロイ | `apps/web` の devDependencies に含まれる |

`gcloud` の導入とログインは対話が必要なので、Claude Code のプロンプトで
`!` を先頭に付けて実行してください（例: `!gcloud auth login`）。

```sh
brew install --cask google-cloud-sdk
```

## 1. Neon（データベース）

1. https://neon.com/ でプロジェクトを作成（リージョンは **Asia Pacific (Tokyo)**）
2. 接続文字列をコピーする。次の形をしている:
   `postgresql://user:password@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`

Doctrine 用に `&serverVersion=16&charset=utf8` を末尾に足す。

### マイグレーションを適用する

本番 DB へのスキーマ適用はローカルから行う（Cloud Run 側では実行しない）。

```sh
cd apps/api
DATABASE_URL="postgresql://…?sslmode=require&serverVersion=16&charset=utf8" \
  php bin/console doctrine:migrations:migrate --no-interaction
```

## 2. Cloud Run（Symfony API）

```sh
# 初回のみ
!gcloud auth login
!gcloud config set project <PROJECT_ID>
!gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com

# デプロイ
cd apps/api
gcloud run deploy blog-api \
  --source . \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 3 \
  --set-env-vars "APP_ENV=prod,APP_DEBUG=0" \
  --set-env-vars "DATABASE_URL=postgresql://…?sslmode=require&serverVersion=16&charset=utf8" \
  --set-env-vars "APP_SECRET=$(openssl rand -hex 32)" \
  --set-env-vars "GOOGLE_CLIENT_ID=…,GOOGLE_CLIENT_SECRET=…" \
  --set-env-vars "GOOGLE_REDIRECT_URI=https://<サイトのドメイン>/auth/callback" \
  --set-env-vars "SITE_HOST=<サイトのドメイン>"
```

`DEV_LOGIN_ENABLED` は**本番では設定しない**（開発用ログインは APP_ENV=dev でしか動かないが、念のため）。

**`--max-instances 3` は必ず付ける。** 上限がないと、想定外のアクセスや
無限ループで無料枠を突き抜けて課金される。

### Google OAuth クライアント

1. Google Cloud コンソール →「API とサービス」→「認証情報」→「OAuth クライアント ID を作成」
2. 種類は「ウェブ アプリケーション」
3. 承認済みのリダイレクト URI に `https://<サイトのドメイン>/auth/callback` を登録
   （ローカル用に `http://localhost:3100/auth/callback` も足してよい）
4. 同意画面のスコープは `openid` と `profile` だけ（メールアドレスは取らない）

デプロイが終わると `https://blog-api-xxxxx.asia-northeast1.run.app` のような
URL が払い出される。動作確認:

```sh
curl https://blog-api-xxxxx.asia-northeast1.run.app/api/lobby
```

### 秘密情報について

上の手順では簡単のため環境変数に直接書いている。
値は Cloud Run のサービス設定に平文で保存され、プロジェクトの閲覧権限が
あれば見える（個人プロジェクトなら自分だけ）。
より厳密にするなら Secret Manager を使う（無料枠: アクティブなシークレット6個まで）。

## 3. 予算アラート（必ず設定する）

Cloud Run の無料枠は東京リージョンでも使えるが、**下り帯域の無料枠は
北米リージョンからのみ**。東京からの通信は約 $0.12/GB の課金対象になる。
このブログの想定消費は月100MB未満（月1円未満）だが、監視は入れておく。

1. Google Cloud コンソール → 「お支払い」→「予算とアラート」
2. 予算額を ¥100 程度に設定
3. 50% / 90% / 100% でメール通知

Artifact Registry のストレージ無料枠は 0.5GB。イメージがこれを超えると
月数円かかる（現在のイメージサイズは後述）。

## 4. Cloudflare Workers（フロントエンド）

### 環境変数のスコープに注意

**ビルドコマンドの前に環境変数を付けても Worker には届かない。**
このプロジェクトには環境変数の読み取り経路が2つある。

| 読む場所 | 供給元 | 該当するもの |
|---|---|---|
| Worker の中 | `apps/web/.env`（ビルド時に `.dev.vars` へ変換される） | `src/lib/api.ts` の `API_BASE_URL`、`src/lib/site.ts` の `SITE_URL` |
| Node のビルドプロセス | シェルの環境変数 | `vite.config.ts` のサイトマップ `host` |
| デプロイ後の Worker | `wrangler.jsonc` の `vars` と `wrangler secret` | 実行時の全て |

プリレンダリング（旧ブログの `/posts/:slug` のみ）は**ビルド中にローカルで Worker を動かして**行われるため、
本番の記事を取りに行かせるには `apps/web/.env` を本番向けに書き換える必要がある。

### 独自ドメインが必要な理由

公開 API の応答を Workers の Cache API に置いて Neon を眠らせる設計だが、
**Cache API は `*.workers.dev` では何もしない**（独自ドメインのゾーンでだけ効く）。
workers.dev のまま公開すると、閲覧のたびに Cloud Run と Neon まで届いて無料枠を消費する。
Cloudflare にドメインを追加し、Worker にカスタムドメインを割り当ててから公開すること。

セッション Cookie の `Secure` は `SITE_URL` が `https://` で始まるときだけ付く。

### 手順

```sh
cd apps/web

# 1. ビルド（プリレンダリング）用の値を .env に設定する
cat > .env <<'EOF'
API_BASE_URL=https://blog-api-xxxxx.asia-northeast1.run.app
SITE_URL=https://times.example.com
EOF

# 2. デプロイ後の Worker が使う値を wrangler.jsonc に書く
#    vars.API_BASE_URL と vars.SITE_URL を上と同じ値に

# 3. 投稿画像の置き場（初回のみ）
pnpm exec wrangler r2 bucket create blog-images

# 4. ビルドしてデプロイ
#    ビルド時にアーカイブ記事のプリレンダリングが走るため、Cloud Run が起動している必要がある
pnpm run deploy
```

Worker は秘密情報を持たない（ログインの検証は API 側で行う）。

### ローカルで本番同等の確認をする

Cloud Run に上げる前に、手元のコンテナで通しの確認ができる。

```sh
# 本番と同じイメージをビルドして起動
cd apps/api
docker build -t blog-api:local .
docker run -d --name blog-api-prod --network api_default -p 8090:8080 \
  -e APP_SECRET=$(openssl rand -hex 32) \
  -e DATABASE_URL="postgresql://blog:blog@database:5432/blog?serverVersion=16&charset=utf8" \
  blog-api:local

# .env の API_BASE_URL を http://127.0.0.1:8090 にしてビルド
cd ../web && pnpm run build
```

イメージサイズは約 685MB、コールドスタートは手元で約2.5秒。
Cloud Run ではこれにイメージ取得が加わる。
読者はプリレンダリング済み HTML を見るのでこの遅延には当たらない。

## 5. 最初の管理者を任命する

管理画面（`/admin`）は `role=admin` のユーザーだけが開ける。最初の1人は画面から作れないので、
本人が Google でログインして handle を決めたあと、本番 DB に対して実行する。

```sh
cd apps/api
DATABASE_URL="postgresql://…?sslmode=require&serverVersion=16&charset=utf8" \
  php bin/console app:user:role <handle>
```

## 6. Neon が眠っていることを確かめる

無料枠（100 CU-hours）を守る要は、閲覧が Neon まで届かないこと。公開後に次を確認する。

1. Neon コンソールの Monitoring で、アクセスがない時間帯に Compute が **Idle（suspended）** になっているか
2. 同じページを続けて開き、Cloud Run のログに同じ公開 API（`/api/lobby` など）が
   15 秒に1回程度しか出ていないか（毎回出ていればエッジキャッシュが効いていない → 独自ドメインを確認）
3. 公開 API のレスポンスヘッダーに `Cache-Control: public, max-age=0, s-maxage=15` が付いているか

```sh
curl -sI https://blog-api-xxxxx.asia-northeast1.run.app/api/lobby | grep -i cache-control
```

ログイン中の人の画面は、ヘッダーの未読数（`/api/me`）と自分のリアクション状態
（`/api/me/viewer-state`）を取るたびに DB に届く。常時ポーリングはしていないので、
届くのは画面を開いたとき・タブに戻ったときだけ。

## 7. 旧ブログの記事を直したとき

アーカイブ（`/posts/:slug`）はビルド時に静的化しているので、再デプロイで反映される。

```sh
cd apps/web && pnpm run deploy
```

## チェックリスト

- [ ] Neon プロジェクト作成（東京）
- [ ] マイグレーション適用
- [ ] Cloud Run デプロイ（`--max-instances 3` 付き）
- [ ] 予算アラート設定
- [ ] Google OAuth クライアント作成（リダイレクト URI を登録）
- [ ] `wrangler.jsonc` の vars 更新
- [ ] R2 バケット作成
- [ ] Cloudflare Workers デプロイ（**独自ドメインで**）
- [ ] 最初の管理者を任命
- [ ] 利用規約・プライバシーポリシーの制定日・連絡先を記入
- [ ] Neon が眠ることを確認
