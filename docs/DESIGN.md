# 個人ブログ 設計書

> **times サービス化により、この設計書は一部が古くなっている。** 変更点は [PLAN.md](PLAN.md) を参照。
> 主な違い: 記事（Post）は読み取り専用のアーカイブ（ArchivedPost, `/api/archive/*`）になり、
> 静的化は `/posts/:slug` だけ。認証は `X-Admin-Token` / Cloudflare Access をやめて
> Google OAuth ＋ セッショントークン（管理者は `role=admin`）にした。

参考: [azukiazusa.dev](https://azukiazusa.dev/) / [pote-chil.com（現 oteto.dev）](https://pote-chil.com/)

## 1. 技術スタック（確定）

| 領域 | 採用 |
|---|---|
| バックエンド | **Symfony 7 + NelmioApiDocBundle**（PHP 8.3+） |
| ORM | Doctrine ORM |
| DB | **Neon**（サーバーレス PostgreSQL・無料枠） |
| API 型生成 | **openapi-typescript** |
| API クライアント | **openapi-fetch** + **openapi-react-query** |
| データ取得 | **TanStack Query** |
| フロントエンド | **TanStack Start**（React） |
| スタイル | Tailwind CSS v4 + `@tailwindcss/typography` |
| API ホスティング | **Google Cloud Run**（scale-to-zero・Always Free 枠・東京） |
| フロント ホスティング | **Cloudflare Workers**（Static Assets・無料枠） |
| パッケージ管理 | pnpm workspace（`corepack enable pnpm` で導入） |

## 2. アーキテクチャ

```
[読者] ──────> Cloudflare Workers
                プリレンダリング済み静的HTML
                （Symfony には到達しない）

[管理者] ────> Cloudflare Workers /admin
                SSR + TanStack Query
                     │ openapi-fetch（型付き）
                     ↓
                Symfony API (Cloud Run / scale-to-zero / asia-northeast1)
                     │ Doctrine
                     ↓
                Neon PostgreSQL

[記事公開時] admin → API → 公開成功後に Cloudflare のデプロイフックを叩く
                                    ↓
                            リビルド（prerender 再実行）→ 反映（1〜2分）
```

### 公開ページを prerender する理由

Cloud Run は scale-to-zero のため、アイドル後の初回リクエストで
PHP コンテナのコールドスタート（数秒）が発生する。
読者のリクエストがここに到達する設計にすると表示速度が破綻し、SEO にも響く。

**公開ページを TanStack Start の prerender で静的化**すれば、
Symfony が起動するのは「記事を書くとき」と「ビルド時」だけになり、
コールドスタートが読者から完全に見えなくなる。

- 代償: 記事公開の反映にリビルド時間（1〜2分）がかかる
- 対象: `/`, `/posts`, `/posts/*`, `/tags`, `/tags/*`, `/about`, `/rss.xml`
- `/admin/*` は prerender 対象外（SSR のまま）

### 無料枠の見積もり

| サービス | 無料枠 | 消費見込み |
|---|---|---|
| Cloud Run | 200万req / 180,000 vCPU秒 / 360,000 GB秒（東京も対象） | 管理画面とビルド時のみ。大幅に余る |
| Cloud Run 下り帯域 | 無料は北米からのみ。東京は約 $0.12/GB | 月100MB未満の見込み → 月1円未満 |
| Neon | 100 CU-hours、ストレージ0.5GB、転送5GB | 同上。アイドル時は自動サスペンド |
| Cloudflare Workers | 10万req/日 | 読者トラフィック全て |

### リスクと対策

1. **GCP は無料枠の利用にも請求先アカウント（カード）が必須。** 超過すると課金される。
   - 対策: `--max-instances=3` で上限を固定、予算アラートを設定
2. **コンピュートの無料枠は東京リージョンでも使える**（検証済み）。
   `asia-northeast1` は `us-central1` と同じ **Tier 1** で、無料枠の対象。
   ただし**下り帯域の無料枠（1GB/月）は北米リージョンからのみ**で、
   東京から出る通信は約 $0.12/GB の課金対象。
   - 見積もり: API を呼ぶのは管理画面とビルド時のプリレンダリングのみ。
     記事200件でも1ビルド数MB、月30ビルドで100MB未満 → 月1円未満
   - 対策: 東京リージョンを採用し、予算アラートで監視する
3. Neon は無料枠超過時にコンピュートが停止するだけで課金されない（安全側）

## 3. OpenAPI パイプライン

```
Symfony + Nelmio
  └─ php bin/console nelmio:apidoc:dump --format=json > packages/api-client/openapi.json
       └─ openapi-typescript openapi.json -o src/schema.d.ts
            └─ openapi-fetch: createClient<paths>({ baseUrl })
                 └─ openapi-react-query: TanStack Query フックを型付きで生成
```

- 生成物 `schema.d.ts` は **コミットする**（CI でフロントだけをビルドできるようにするため）
- CI で「spec を再生成して差分が出たら失敗」させ、**実装と spec の乖離を防ぐ**

## 4. データベーススキーマ（Doctrine エンティティ）

```
Post
  id           int        PK
  slug         string     unique
  title        string
  bodyMd       text                  -- Markdown 原文
  bodyHtml     text                  -- 変換済み HTML
  excerpt      string     nullable
  status       string                -- 'draft' | 'published'
  publishedAt  datetime   nullable
  createdAt    datetime
  updatedAt    datetime
  tags         ManyToMany -> Tag

Tag
  id    int     PK
  name  string  unique   -- 表示名 "JavaScript"
  slug  string  unique   -- URL 用 "javascript"
```

インデックス: `(status, publishedAt DESC)`, `slug`

**Markdown → HTML の変換は Symfony 側で保存時に行う**（`league/commonmark`）。
フロントは `bodyHtml` を受け取って描画するだけ。
シンタックスハイライトはビルド時に Shiki を通すか、CSS ベースの highlight.js を使う。

Phase 2 追加予定: `Post.ogpImage`、`PostView`（閲覧数）

## 5. API 設計

### 公開エンドポイント（認証不要・読み取りのみ）

| メソッド | パス | 内容 |
|---|---|---|
| GET | `/api/posts` | 公開記事一覧。`?page=&perPage=&tag=` |
| GET | `/api/posts/{slug}` | 記事詳細 |
| GET | `/api/tags` | タグ一覧（記事数つき） |

### 管理エンドポイント（要認証）

| メソッド | パス | 内容 |
|---|---|---|
| GET | `/api/admin/posts` | 下書き含む全記事 |
| POST | `/api/admin/posts` | 新規作成 |
| GET | `/api/admin/posts/{id}` | 取得（編集用に bodyMd を返す） |
| PUT | `/api/admin/posts/{id}` | 更新 |
| DELETE | `/api/admin/posts/{id}` | 削除 |
| POST | `/api/admin/posts/{id}/publish` | 公開（publishedAt 設定 + リビルド発火） |
| POST | `/api/admin/tags` | タグ作成 |

全エンドポイントに Nelmio の属性で OpenAPI 注釈を付ける。

## 6. 認証

**Phase 1: Cloudflare Access**（Zero Trust 無料枠・50ユーザーまで）で `/admin/*` を保護。
アプリ側の認証実装がゼロで済む。API 側の管理エンドポイントは
Worker と Symfony 間の共有シークレットヘッダーで保護する。

**Phase 2 の選択肢**: LexikJWTAuthenticationBundle で JWT 認証を自前実装。
学習価値は高いが Phase 1 には不要。

## 7. ディレクトリ構成

```
blog/
├── pnpm-workspace.yaml
├── docs/DESIGN.md
├── apps/
│   ├── api/                      # Symfony 7
│   │   ├── Dockerfile            # FrankenPHP ベース
│   │   ├── config/packages/nelmio_api_doc.yaml
│   │   └── src/
│   │       ├── Entity/           # Post, Tag
│   │       ├── Repository/
│   │       ├── Controller/Api/
│   │       └── Dto/              # リクエスト/レスポンス（OpenAPI の型の源）
│   └── web/                      # TanStack Start
│       ├── wrangler.jsonc
│       └── src/routes/
│           ├── index.tsx             # トップ
│           ├── posts.index.tsx       # 記事一覧
│           ├── posts.$slug.tsx       # 記事詳細
│           ├── tags.index.tsx
│           ├── tags.$slug.tsx
│           ├── about.tsx
│           └── admin/                # prerender 対象外
│               ├── index.tsx
│               ├── posts.new.tsx
│               └── posts.$id.edit.tsx
└── packages/
    └── api-client/               # openapi.json + schema.d.ts + クライアント
```

## 8. URL 設計（公開サイト）

| パス | 内容 |
|---|---|
| `/` | プロフィール + 最新記事 + タグクラウド |
| `/posts` | 記事一覧（`?page=2`） |
| `/posts/[slug]` | 記事詳細 |
| `/tags` | タグ一覧 |
| `/tags/[slug]` | タグ別一覧 |
| `/about` | プロフィール |
| `/rss.xml` / `/sitemap.xml` | フィード・サイトマップ |

## 9. 実装順序

### Phase 1 — 記事を書いて公開できる状態にする

1. ~~モノレポ初期化（pnpm workspace）~~ **完了**
2. ~~**Symfony API をローカルで立てる**~~ **完了** — Docker Compose（Postgres 16）、
   Post/Tag エンティティ、公開系・管理系エンドポイント、Nelmio 設定、
   共有シークレット認証、JSON エラーレスポンス
3. ~~**OpenAPI パイプラインを通す**~~ **完了** — spec ダンプ → openapi-typescript →
   openapi-fetch / openapi-react-query まで疎通確認済み
4. ~~**TanStack Start で公開ページ**~~ **完了** — トップ / 記事一覧 / 記事詳細 /
   タグ一覧 / タグ別一覧 / about、ダークモード対応、プリレンダリング — 一覧・詳細・タグ、Tailwind でデザイン
5. ~~**管理画面**~~ **完了** — 一覧・新規投稿・編集・公開切替・削除・タグ作成、
   Markdown ライブプレビュー（ローカル、認証なし）
6. **Neon にデプロイ、Cloud Run にデプロイ**（東京リージョン、max-instances 制限、予算アラート） ← 次はここ
7. **Cloudflare Workers にフロントをデプロイ**、prerender 設定
8. ~~RSS・サイトマップ・OGP メタタグ~~ **完了**

### Phase 2

1. Cloudflare Access で `/admin` を保護
2. 記事公開時のリビルド自動トリガー
3. 画像アップロード（Cloudflare R2）
4. 閲覧数カウント、全文検索
5. OGP 画像の動的生成

## 10. 検証状況

### 検証済み（Phase 1 で実証）

- **Nelmio の spec が openapi-typescript でそのまま使える** — OpenAPI 3.0.0 が出力され、
  `nullable` は `| null`、`$ref` はネストした型参照に正しく変換される。
  ただし DTO 内の配列要素は文字列 `$ref` ではなく `new Model(type: X::class)` で
  参照しないとスキーマが登録されない（Nelmio 5 の仕様）。
- **openapi-fetch + openapi-react-query が生成型で動く** —
  `packages/api-client/scripts/smoke.ts` で実 API への疎通を確認済み。
  peer 依存の都合で openapi-fetch は `^0.17.0` が必要（`^0.14` では合わない）。
- **`/api/` 配下の例外を JSON で返す** — Symfony の既定は HTML エラーページなので
  `ApiExceptionSubscriber` が必須。これがないとフロント側で JSON パースに失敗する。

- **Cloud Run の無料枠は東京リージョン（asia-northeast1）でも使える** —
  Tier 1 リージョンに分類されており、`us-central1` と同条件。
  当初「北米限定」と想定して設計していたが、これは誤りだった。
  下り帯域の無料枠だけは北米限定なので、そこは課金前提で見積もる。
- **TanStack Start の prerender が期待通り動く** — `crawlLinks` により `/` を起点に
  記事詳細・タグ別一覧まで自動でクロールし、13ページを静的 HTML 化できた。
  `sitemap` オプションで sitemap.xml も同時に生成される。
  ビルド時に API が起動している必要がある（`failOnError: true` で事故を防ぐ）。
- **サーバールートは `createFileRoute` の `server.handlers`** で書く。
  ファイル名でドットを表すには `rss[.]xml.ts` のようにブラケットを使う。

- **prerender と管理画面の SSR は1デプロイで共存する** — prerender の `filter` で
  `/admin` を静的化から外し、公開ページ11件だけを静的 HTML 化できた。
  ただし **`filter` はサイトマップには効かない**。管理画面をサイトマップから外すには
  `pages` に `sitemap: { exclude: true }` を明示する必要がある。
- **ルート自動探索は `/posts` と `/posts/` を両方見つける** — 放置すると同じ内容が
  2つの URL で配信され重複コンテンツになる。`pages` で末尾スラッシュ版を除外し、
  ルーターに `trailingSlash: 'never'` を設定して正規 URL を1つに絞った。
- **環境変数の読み取り経路が2つある** — Worker の中（`API_BASE_URL` など）は
  `apps/web/.env` → `.dev.vars` 経由でしか届かず、ビルドコマンドの前に付けた
  シェル環境変数は無視される。一方 `vite.config.ts` は Node のプロセスなので
  シェル環境変数が効く。本番ビルド時は `.env` を本番向けに書き換える必要がある。
- **本番イメージでの通し確認済み** — FrankenPHP ベース（685MB）、
  応答 35ms 前後、コールドスタート約2.5秒。
  このコンテナを相手に11ページのプリレンダリングが成功することを確認した。
- **サーバー関数の戻り値でカスタム例外クラスは使えない** — seroval が RPC 境界で
  素の Error に落とすため `instanceof` が効かず、フィールド単位のエラーを
  画面で拾えなくなる。書き込み系は `{ ok: true, ... } | { ok: false, errors }` の
  素のオブジェクトを返すこと。

### 未検証（残りの Phase 1 で確認する）

- TanStack Start は RC 段階のため、着手時点の最新ドキュメントで API を確認する

### 環境上の既知の問題

- このマシンは **nodebrew と nvm が併存**し、PATH 上で nodebrew が先にあるため
  `pnpm` が 6.11.0 に解決される（`node` は nvm の v22.23.2）。
  当面は nvm 側の corepack を明示的に呼ぶ。恒久対応は要判断（README 参照）。
- `brew` の `postgresql@14` は icu4c のバージョン不整合で起動しない。
  開発用 DB は Docker Compose（`postgres:16-alpine`, ポート 5433）を使う。

## 11. 未決定事項

- **プロジェクト名 / 独自ドメイン**（現在は仮に `blog/`）
- デザインの方向性（配色、フォント、ダークモードの要否）
- プロフィールに載せる内容

## 参考

- [Cloud Run 無料枠](https://docs.cloud.google.com/free/docs/free-cloud-features)
- [Neon Pricing](https://neon.com/pricing)
- [TanStack Start / Static Prerendering](https://tanstack.com/start/latest/docs/framework/react/guide/static-prerendering)
- [TanStack Start / Hosting](https://tanstack.com/start/latest/docs/framework/react/guide/hosting)
