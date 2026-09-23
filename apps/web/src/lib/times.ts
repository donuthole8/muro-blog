import { createServerFn } from '@tanstack/react-start'
import { notFound } from '@tanstack/react-router'
import { getApiClient } from './api'
import { throwRead } from './result'

/**
 * times の公開データ（誰が見ても同じ）。すべてエッジキャッシュを通る。
 * 閲覧者ごとの情報は account.ts 側（viewer-state など）で別に取る。
 */

export const fetchLobby = createServerFn({ method: 'GET' })
  .validator((input: { cursor?: string }) => input)
  .handler(async ({ data }) => {
    const {
      data: page,
      error,
      response,
    } = await getApiClient().fetch.GET('/api/lobby', {
      params: { query: { cursor: data.cursor } },
    })
    if (!page) throwRead(error, response.status, 'ロビーの取得に失敗しました。')

    return page
  })

export const fetchPopularRooms = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { data, error, response } =
      await getApiClient().fetch.GET('/api/rooms/popular')
    if (!data)
      throwRead(error, response.status, '人気の部屋の取得に失敗しました。')

    return data
  },
)

export const fetchProfile = createServerFn({ method: 'GET' })
  .validator((input: { handle: string }) => input)
  .handler(async ({ data }) => {
    const {
      data: profile,
      error,
      response,
    } = await getApiClient().fetch.GET('/api/users/{handle}', {
      params: { path: { handle: data.handle } },
    })
    if (response.status === 404) throw notFound()
    if (!profile)
      throwRead(error, response.status, '部屋の取得に失敗しました。')

    return profile
  })

export const fetchRoomPosts = createServerFn({ method: 'GET' })
  .validator((input: { handle: string; cursor?: string }) => input)
  .handler(async ({ data }) => {
    const {
      data: page,
      error,
      response,
    } = await getApiClient().fetch.GET('/api/users/{handle}/posts', {
      params: {
        path: { handle: data.handle },
        query: { cursor: data.cursor },
      },
    })
    if (response.status === 404) throw notFound()
    if (!page) throwRead(error, response.status, '投稿の取得に失敗しました。')

    return page
  })

export const fetchThread = createServerFn({ method: 'GET' })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const {
      data: thread,
      error,
      response,
    } = await getApiClient().fetch.GET('/api/posts/{id}', {
      params: { path: { id: data.id } },
    })
    if (response.status === 404) throw notFound()
    if (!thread)
      throwRead(error, response.status, 'スレッドの取得に失敗しました。')

    return thread
  })

export const fetchTags = createServerFn({ method: 'GET' }).handler(async () => {
  const { data, error, response } = await getApiClient().fetch.GET('/api/tags')
  if (!data) throwRead(error, response.status, 'タグの取得に失敗しました。')

  return data
})

export const fetchTagPosts = createServerFn({ method: 'GET' })
  .validator((input: { slug: string; cursor?: string }) => input)
  .handler(async ({ data }) => {
    const {
      data: page,
      error,
      response,
    } = await getApiClient().fetch.GET('/api/tags/{slug}/posts', {
      params: { path: { slug: data.slug }, query: { cursor: data.cursor } },
    })
    if (response.status === 404) throw notFound()
    if (!page) throwRead(error, response.status, '投稿の取得に失敗しました。')

    return page
  })

export const fetchOrg = createServerFn({ method: 'GET' })
  .validator((input: { slug: string }) => input)
  .handler(async ({ data }) => {
    const {
      data: org,
      error,
      response,
    } = await getApiClient().fetch.GET('/api/orgs/{slug}/users', {
      params: { path: { slug: data.slug } },
    })
    if (response.status === 404) throw notFound()
    if (!org) throwRead(error, response.status, '部屋の取得に失敗しました。')

    return org
  })

export const fetchSearch = createServerFn({ method: 'GET' })
  .validator((input: { q: string; cursor?: string }) => input)
  .handler(async ({ data }) => {
    const {
      data: result,
      error,
      response,
    } = await getApiClient().fetch.GET('/api/search', {
      params: { query: { q: data.q, cursor: data.cursor } },
    })
    if (!result) throwRead(error, response.status, '検索に失敗しました。')

    return result
  })
