import { createServerFn } from '@tanstack/react-start'
import { notFound } from '@tanstack/react-router'
import { POSTS_PER_PAGE, getApiClient } from './api'

/**
 * 記事一覧を取得する。
 *
 * プリレンダリング時はビルドマシンから、
 * クライアント遷移時は Worker 経由で呼ばれる。
 */
export const fetchPosts = createServerFn({ method: 'GET' })
  .validator((input: { page?: number; tag?: string }) => input)
  .handler(async ({ data }) => {
    const { data: result } = await getApiClient().fetch.GET('/api/posts', {
      params: {
        query: {
          page: data.page ?? 1,
          perPage: POSTS_PER_PAGE,
          tag: data.tag,
        },
      },
    })

    if (!result) {
      throw new Error('記事一覧の取得に失敗しました。')
    }

    return result
  })

export const fetchPost = createServerFn({ method: 'GET' })
  .validator((input: { slug: string }) => input)
  .handler(async ({ data }) => {
    const { data: post, response } = await getApiClient().fetch.GET(
      '/api/posts/{slug}',
      { params: { path: { slug: data.slug } } },
    )

    if (response.status === 404) {
      throw notFound()
    }
    if (!post) {
      throw new Error('記事の取得に失敗しました。')
    }

    return post
  })

export const fetchTags = createServerFn({ method: 'GET' }).handler(async () => {
  const { data: tags } = await getApiClient().fetch.GET('/api/tags')

  if (!tags) {
    throw new Error('タグの取得に失敗しました。')
  }

  return tags
})
