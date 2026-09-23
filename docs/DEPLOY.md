# デプロイ手順

構成は [DESIGN.md](DESIGN.md) を参照。

```
[読者] → Cloudflare Workers（静的HTML）      ← Symfony には到達しない
[管理] → Cloudflare Workers /admin → Cloud Run (Symfony) → Neon (PostgreSQL)
```

## 0. 事前に必要なもの

| | 用途 | 備考 |
|---|---|---|
| Neon アカウント | PostgreSQL | 無料。カード不要 |
| Google Cloud アカウント | Cloud Run | **カード登録が必須**（無料枠内なら課金されない） |
| Cloudflare アカウント | Workers | 無料。カード不要 |
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
  --set-env-vars "ADMIN_TOKEN=$(openssl rand -hex 32)"
```

**`--max-instances 3` は必ず付ける。** 上限がないと、想定外のアクセスや
無限ループで無料枠を突き抜けて課金される。

`ADMIN_TOKEN` に設定した値は控えておくこと。手順4で Cloudflare 側にも登録する。

デプロイが終わると `https://blog-api-xxxxx.asia-northeast1.run.app` のような
URL が払い出される。動作確認:

```sh
curl https://blog-api-xxxxx.asia-northeast1.run.app/api/posts
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
| Worker の中 | `apps/web/.env`（ビルド時に `.dev.vars` へ変換される） | `src/lib/api.ts` の `API_BASE_URL`、`src/lib/site.ts` の `SITE_URL`、`ADMIN_TOKEN` |
| Node のビルドプロセス | シェルの環境変数 | `vite.config.ts` のサイトマップ `host` |
| デプロイ後の Worker | `wrangler.jsonc` の `vars` と `wrangler secret` | 実行時の全て |

プリレンダリングは**ビルド中にローカルで Worker を動かして**行われるため、
本番の記事を取りに行かせるには `apps/web/.env` を本番向けに書き換える必要がある。

### 手順

```sh
cd apps/web

# 1. ビルド（プリレンダリング）用の値を .env に設定する
cat > .env <<'EOF'
API_BASE_URL=https://blog-api-xxxxx.asia-northeast1.run.app
SITE_URL=https://blog.example.com
ADMIN_TOKEN=<手順2で設定した値>
EOF

# 2. デプロイ後の Worker が使う値を wrangler.jsonc に書く
#    vars.API_BASE_URL と vars.SITE_URL を上と同じ値に

# 3. 管理 API のトークンは秘密情報として登録する（wrangler.jsonc には書かない）
pnpm exec wrangler secret put ADMIN_TOKEN

# 4. ビルドしてデプロイ
#    ビルド時にプリレンダリングが走るため、Cloud Run が起動している必要がある
pnpm run deploy
```

`.env` は `.gitignore` 済み（ADMIN_TOKEN を含むため絶対にコミットしないこと）。

### ローカルで本番同等の確認をする

Cloud Run に上げる前に、手元のコンテナで通しの確認ができる。

```sh
# 本番と同じイメージをビルドして起動
cd apps/api
docker build -t blog-api:local .
docker run -d --name blog-api-prod --network api_default -p 8090:8080 \
  -e APP_SECRET=$(openssl rand -hex 32) \
  -e ADMIN_TOKEN=rehearsal-token \
  -e DATABASE_URL="postgresql://blog:blog@database:5432/blog?serverVersion=16&charset=utf8" \
  blog-api:local

# .env の API_BASE_URL を http://127.0.0.1:8090 にしてビルド
cd ../web && pnpm run build
```

イメージサイズは約 685MB、コールドスタートは手元で約2.5秒。
Cloud Run ではこれにイメージ取得が加わる。
読者はプリレンダリング済み HTML を見るのでこの遅延には当たらない。

## 5. 記事を書いて公開する

1. `https://<Workers の URL>/admin` を開く
2. 記事を書いて「公開する」
3. **再ビルド・再デプロイすると公開ページに反映される**（1〜2分）

```sh
cd apps/web && pnpm run deploy
```

Phase 2 でここを自動化する（公開 API がデプロイフックを叩く）。

## 6. 管理画面を保護する（Phase 2）

Phase 1 の時点では `/admin` は URL を知っていれば誰でも開ける。
**公開前に必ず Cloudflare Access をかけること。**

1. Cloudflare ダッシュボード → Zero Trust → Access → Applications
2. Self-hosted アプリケーションを追加し、パスを `/admin*` に設定
3. ポリシーで自分の Google アカウントのメールアドレスのみ許可

無料枠は50ユーザーまで。アプリ側の実装は不要。

## チェックリスト

- [ ] Neon プロジェクト作成（東京）
- [ ] マイグレーション適用
- [ ] Cloud Run デプロイ（`--max-instances 3` 付き）
- [ ] 予算アラート設定
- [ ] `wrangler.jsonc` の vars 更新
- [ ] `wrangler secret put ADMIN_TOKEN`
- [ ] Cloudflare Workers デプロイ
- [ ] **Cloudflare Access で `/admin` を保護**
