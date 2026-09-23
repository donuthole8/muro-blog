/**
 * 生成した型付きクライアントで実際の API を叩く疎通確認。
 * Symfony が 127.0.0.1:8000 で動いている状態で実行する。
 */
import { createApiClient } from "../src/index.js";

const api = createApiClient({
  baseUrl: "http://127.0.0.1:8000",
  adminToken: "dev-local-token",
});

const { data: posts, error: postsError } = await api.fetch.GET("/api/posts", {
  params: { query: { perPage: 5, page: 1 } },
});
if (postsError) throw new Error(`一覧の取得に失敗: ${JSON.stringify(postsError)}`);

console.log(`記事一覧: ${posts.total} 件 (${posts.totalPages} ページ)`);
for (const post of posts.items) {
  // post.title / post.tags は型が付いている
  console.log(`  - ${post.title} [${post.tags.map((t) => t.name).join(", ")}]`);
}

const first = posts.items[0];
if (first) {
  const { data: detail } = await api.fetch.GET("/api/posts/{slug}", {
    params: { path: { slug: first.slug } },
  });
  console.log(`詳細取得: ${detail?.title} / HTML ${detail?.bodyHtml.length} 文字`);
}

const { data: tags } = await api.fetch.GET("/api/tags");
console.log(`タグ: ${tags?.map((t) => `${t.name}(${t.postCount})`).join(", ")}`);

// 管理 API（X-Admin-Token が自動で付く）
const { data: adminPosts } = await api.fetch.GET("/api/admin/posts");
console.log(`管理一覧: ${adminPosts?.length} 件（下書き含む）`);

// バリデーションエラーが型付きで受け取れることの確認
const { error: validationError, response } = await api.fetch.POST("/api/admin/posts", {
  body: { title: "", slug: "NG", bodyMd: "", tagSlugs: [] },
});
console.log(`バリデーション: HTTP ${response.status} ->`, JSON.stringify(validationError?.errors));
