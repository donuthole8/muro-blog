import createFetchClient from "openapi-fetch";
import createQueryHooks from "openapi-react-query";
import type { paths, components } from "./schema";

/** レスポンスの型。画面側はこれを使う。 */
export type PostSummary = components["schemas"]["PostSummary"];
export type PostDetail = components["schemas"]["PostDetail"];
export type PaginatedPosts = components["schemas"]["PaginatedPosts"];
export type TagSummary = components["schemas"]["TagSummary"];
export type TagWithCount = components["schemas"]["TagWithCount"];

export type ApiClientOptions = {
  baseUrl: string;
  /**
   * 管理系エンドポイントを叩くときの共有シークレット。
   * サーバーサイドからのみ渡すこと（ブラウザに露出させない）。
   */
  adminToken?: string;
};

/**
 * 型付きの fetch クライアントを作る。
 *
 * SSR とブラウザで baseUrl が変わるため、シングルトンにせず
 * 呼び出し側で生成する。
 */
export function createApiClient({ baseUrl, adminToken }: ApiClientOptions) {
  const fetchClient = createFetchClient<paths>({
    baseUrl,
    headers: adminToken ? { "X-Admin-Token": adminToken } : undefined,
  });

  return {
    fetch: fetchClient,
    /** TanStack Query 用のフック群（useQuery / useMutation / queryOptions） */
    query: createQueryHooks(fetchClient),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
export type { paths, components };
