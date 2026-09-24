import createFetchClient from "openapi-fetch";
import createQueryHooks from "openapi-react-query";
import type { paths, components } from "./schema";

type Schemas = components["schemas"];

/** レスポンスの型。画面側はこれを使う。 */
export type TimesPost = Schemas["TimesPost"];
export type PostPage = Schemas["PostPage"];
export type Thread = Schemas["Thread"];
export type TagPostPage = Schemas["TagPostPage"];
export type SearchResult = Schemas["SearchResult"];
export type UserSummary = Schemas["UserSummary"];
export type UserProfile = Schemas["UserProfile"];
export type RoomSummary = Schemas["RoomSummary"];
export type OrgRooms = Schemas["OrgRooms"];
export type Me = Schemas["Me"];
export type ViewerState = Schemas["ViewerState"];
export type NotificationItem = Schemas["NotificationItem"];
export type NotificationPage = Schemas["NotificationPage"];
export type ReactionCount = Schemas["ReactionCount"];
export type TagSummary = Schemas["TagSummary"];
export type TagWithCount = Schemas["TagWithCount"];
export type AdminPost = Schemas["AdminPost"];
export type AdminUser = Schemas["AdminUser"];
export type AdminReport = Schemas["AdminReport"];
export type AdminReportPage = Schemas["AdminReportPage"];
export type BlockedUser = Schemas["BlockedUser"];
export type ReportInput = Schemas["ReportInput"];
export type ArchivedPostSummary = Schemas["ArchivedPostSummary"];
export type ArchivedPostDetail = Schemas["ArchivedPostDetail"];
export type PaginatedArchivedPosts = Schemas["PaginatedArchivedPosts"];
export type ArticleCard = Schemas["ArticleCard"];
export type MyArticle = Schemas["MyArticle"];
export type ArticleSource = Schemas["ArticleSource"];
export type ArticleInput = Schemas["ArticleInput"];
export type AdminArticle = Schemas["AdminArticle"];
export type ValidationError = Schemas["ValidationError"];

export type ApiClientOptions = {
  baseUrl: string;
  /**
   * ログインセッションのトークン。Authorization: Bearer で送る。
   * サーバーサイドからのみ渡すこと（ブラウザに露出させない）。
   */
  sessionToken?: string;
  /** fetch の差し替え（Worker のエッジキャッシュを挟むときに使う） */
  fetch?: (input: Request) => Promise<Response>;
};

/**
 * 型付きの fetch クライアントを作る。
 *
 * ログイン状態で送るヘッダーが変わるため、シングルトンにせず
 * 呼び出し側で生成する。
 */
export function createApiClient({
  baseUrl,
  sessionToken,
  fetch,
}: ApiClientOptions) {
  const fetchClient = createFetchClient<paths>({
    baseUrl,
    headers: sessionToken
      ? { Authorization: `Bearer ${sessionToken}` }
      : undefined,
    fetch,
  });

  return {
    fetch: fetchClient,
    /** TanStack Query 用のフック群（useQuery / useMutation / queryOptions） */
    query: createQueryHooks(fetchClient),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
export type { paths, components };
