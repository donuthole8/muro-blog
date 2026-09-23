/**
 * 生成した型付きクライアントで実際の API を叩く疎通確認。
 * Symfony が 127.0.0.1:8000 で動いていて、apps/api/.env で
 * DEV_LOGIN_ENABLED=1 になっている状態で実行する。
 */
import { createApiClient } from "../src/index.js";

const baseUrl = "http://127.0.0.1:8000";
const anonymous = createApiClient({ baseUrl });

const { data: lobby, error: lobbyError } = await anonymous.fetch.GET("/api/lobby");
if (lobbyError) throw new Error(`ロビーの取得に失敗: ${JSON.stringify(lobbyError)}`);

console.log(`ロビー: ${lobby.items.length} 件 (次のページ: ${lobby.nextCursor ?? "なし"})`);
for (const post of lobby.items.slice(0, 5)) {
  // post.author / post.reactions は型が付いている
  console.log(`  - @${post.author?.handle} 返信${post.replyCount} ${post.reactions.map((r) => `${r.emoji}${r.count}`).join(" ")}`);
}

// 開発用ログイン → 以降はセッショントークン付きのクライアントで叩く
const { data: session } = await anonymous.fetch.POST("/api/auth/dev-login", {
  body: { handle: "smoke_test" },
});
if (!session) throw new Error("開発用ログインに失敗（DEV_LOGIN_ENABLED=1 か確認）");

const api = createApiClient({ baseUrl, sessionToken: session.token });
const { data: me } = await api.fetch.GET("/api/me");
console.log(`ログイン: @${me?.handle}（未読通知 ${me?.unreadNotificationCount} 件）`);

const { data: created } = await api.fetch.POST("/api/posts", {
  body: { bodyMarkdown: "疎通確認の投稿", tagSlugs: [] },
});
console.log(`投稿: ${created?.id}`);

if (created) {
  await api.fetch.PUT("/api/posts/{id}/reactions/{emoji}", {
    params: { path: { id: created.id, emoji: "👍" } },
  });
  const { data: thread } = await anonymous.fetch.GET("/api/posts/{id}", {
    params: { path: { id: created.id } },
  });
  console.log(`スレッド: リアクション ${thread?.post.reactions.map((r) => `${r.emoji}${r.count}`).join(" ")}`);

  await api.fetch.DELETE("/api/posts/{id}", { params: { path: { id: created.id } } });
  console.log("削除しました");
}

// バリデーションエラーが型付きで受け取れることの確認
const { error: validationError, response } = await api.fetch.POST("/api/posts", {
  body: { bodyMarkdown: "", tagSlugs: [] },
});
console.log(`バリデーション: HTTP ${response.status} ->`, JSON.stringify(validationError));
