import { createServerFn } from '@tanstack/react-start'
import { notFound } from '@tanstack/react-router'
import { POSTS_PER_PAGE, getApiClient } from './api'

/**
 * 旧ブログ記事（アーカイブ）。読み取り専用。
 *
 * /posts/:slug はビルド時にプリレンダリングされ、ビルドマシンから呼ばれる。
 */
export const fetchArchivedPosts = createServerFn({ method: 'GET' })
  .validator((input: { page?: number; tag?: string }) => input)
  .handler(async ({ data }) => {
    const { data: result } = await getApiClient().fetch.GET(
      '/api/archive/posts',
      {
        params: {
          query: {
            page: data.page ?? 1,
            perPage: POSTS_PER_PAGE,
            tag: data.tag,
          },
        },
      },
    )

    if (!result) {
      throw new Error('記事一覧の取得に失敗しました。')
    }

    return result
  })

export const fetchArchivedPost = createServerFn({ method: 'GET' })
  .validator((input: { slug: string }) => input)
  .handler(async ({ data }) => {
    const { data: post, response } = await getApiClient().fetch.GET(
      '/api/archive/posts/{slug}',
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
