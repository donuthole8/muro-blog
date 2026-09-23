import {
  infiniteQueryOptions,
  queryOptions,
  useQuery,
} from '@tanstack/react-query'
import type { PostPage, TagPostPage } from '@blog/api-client'
import {
  fetchLobby,
  fetchOrg,
  fetchPopularRooms,
  fetchProfile,
  fetchRoomPosts,
  fetchSearch,
  fetchTagPosts,
  fetchTags,
  fetchThread,
} from './times'
import {
  fetchBlocks,
  fetchFollowing,
  fetchNotifications,
  getMe,
  getViewerState,
} from './account'

/**
 * 画面で使うクエリの定義。
 *
 * 鮮度の方針: 常時ポーリングはせず、画面を開いたとき・タブに戻ったとき
 * （TanStack Query の refetchOnWindowFocus）にだけ取り直す。
 *
 * staleTime は API の s-maxage（15 秒）より長くしておく。短いと、自分の投稿を
 * 楽観的に差し込んだ直後の再取得がエッジに残った古い応答で上書きしてしまい、
 * 投稿が一瞬消えたように見える。
 */
export const PUBLIC_STALE_TIME = 20_000

type Cursor = string | undefined

const nextCursor = (page: PostPage | TagPostPage) =>
  page.nextCursor ?? undefined

export const meQuery = queryOptions({
  queryKey: ['me'],
  queryFn: () => getMe(),
  staleTime: 60_000,
})

/** ログイン中の本人。未ログインなら null。 */
export function useMe() {
  return useQuery(meQuery).data ?? null
}

export const lobbyQuery = infiniteQueryOptions({
  queryKey: ['lobby'],
  queryFn: ({ pageParam }) => fetchLobby({ data: { cursor: pageParam } }),
  initialPageParam: undefined as Cursor,
  getNextPageParam: nextCursor,
})

export const popularRoomsQuery = queryOptions({
  queryKey: ['popular'],
  queryFn: () => fetchPopularRooms(),
  // API 側でも 5 分キャッシュしている集計なので、こちらも頻繁には取り直さない
  staleTime: 5 * 60_000,
})

export const profileQuery = (handle: string) =>
  queryOptions({
    queryKey: ['room', handle, 'profile'],
    queryFn: () => fetchProfile({ data: { handle } }),
  })

export const roomPostsQuery = (handle: string) =>
  infiniteQueryOptions({
    queryKey: ['room', handle, 'posts'],
    queryFn: ({ pageParam }) =>
      fetchRoomPosts({ data: { handle, cursor: pageParam } }),
    initialPageParam: undefined as Cursor,
    getNextPageParam: nextCursor,
  })

export const threadQuery = (id: string) =>
  queryOptions({
    queryKey: ['thread', id],
    queryFn: () => fetchThread({ data: { id } }),
  })

export const searchQuery = (q: string) =>
  infiniteQueryOptions({
    queryKey: ['search', q],
    queryFn: ({ pageParam }) => fetchSearch({ data: { q, cursor: pageParam } }),
    initialPageParam: undefined as Cursor,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: q !== '',
  })

export const tagsQuery = queryOptions({
  queryKey: ['tags'],
  queryFn: () => fetchTags(),
  staleTime: 5 * 60_000,
})

export const tagPostsQuery = (slug: string) =>
  infiniteQueryOptions({
    queryKey: ['tag', slug],
    queryFn: ({ pageParam }) =>
      fetchTagPosts({ data: { slug, cursor: pageParam } }),
    initialPageParam: undefined as Cursor,
    getNextPageParam: nextCursor,
  })

export const orgQuery = (slug: string) =>
  queryOptions({
    queryKey: ['org', slug],
    queryFn: () => fetchOrg({ data: { slug } }),
    staleTime: 5 * 60_000,
  })

export const followingQuery = queryOptions({
  queryKey: ['following'],
  queryFn: () => fetchFollowing(),
  staleTime: 0,
})

export const blocksQuery = queryOptions({
  queryKey: ['blocks'],
  queryFn: () => fetchBlocks(),
  staleTime: 0,
})

export const notificationsQuery = infiniteQueryOptions({
  queryKey: ['notifications'],
  queryFn: ({ pageParam }) =>
    fetchNotifications({ data: { cursor: pageParam } }),
  initialPageParam: undefined as Cursor,
  getNextPageParam: (page) => page?.nextCursor ?? undefined,
  staleTime: 0,
})

/**
 * 画面に並んでいる投稿に対する、閲覧者ごとの情報（自分のリアクション・フォロー状態）。
 * 公開データとは別に取り、画面上で重ねる。
 */
export function useViewerState(postIds: Array<string>, handle?: string) {
  const me = useMe()
  const ids = postIds.filter((id) => !isPendingId(id))

  return useQuery({
    queryKey: ['viewer', ids.join(','), handle ?? null],
    queryFn: () => getViewerState({ data: { postIds: ids, handle } }),
    enabled: me?.handle != null && (ids.length > 0 || handle !== undefined),
  }).data
}

/** 楽観的に差し込んだ、まだサーバーに保存されていない投稿の ID か。 */
export function isPendingId(id: string) {
  return id.startsWith('pending-')
}
