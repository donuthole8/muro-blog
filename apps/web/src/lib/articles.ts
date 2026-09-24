import { createServerFn } from '@tanstack/react-start'
import { notFound } from '@tanstack/react-router'
import type { ArticleInput } from '@blog/api-client'
import { POSTS_PER_PAGE, getApiClient, getSessionApiClient } from './api'
import { throwRead, toFailure, unauthenticated } from './result'

/**
 * ユーザーのブログ記事。公開ページは /@handle/articles/:slug、書くのは /articles/new。
 * 旧ブログの記事（書き手なし）と全体の一覧は lib/archive.ts。
 */

// ---------- 公開（エッジキャッシュを通る） ----------

export const fetchUserArticles = createServerFn({ method: 'GET' })
  .validator((input: { handle: string; page?: number }) => input)
  .handler(async ({ data }) => {
    const { data: result, error, response } = await getApiClient().fetch.GET(
      '/api/users/{handle}/articles',
      {
        params: {
          path: { handle: data.handle },
          query: { page: data.page ?? 1, perPage: POSTS_PER_PAGE },
        },
      },
    )
    if (response.status === 404) throw notFound()
    if (!result)
      throwRead(error, response.status, '記事一覧の取得に失敗しました。')

    return result
  })

export const fetchUserArticle = createServerFn({ method: 'GET' })
  .validator((input: { handle: string; slug: string }) => input)
  .handler(async ({ data }) => {
    const { data: article, error, response } = await getApiClient().fetch.GET(
      '/api/users/{handle}/articles/{slug}',
      { params: { path: { handle: data.handle, slug: data.slug } } },
    )
    if (response.status === 404) throw notFound()
    if (!article) throwRead(error, response.status, '記事の取得に失敗しました。')

    return article
  })

// ---------- 自分の記事（ログイン中の本人として） ----------

/** 下書きを含む自分の記事。未ログインなら null。 */
export const fetchMyArticles = createServerFn({ method: 'GET' }).handler(
  async () => {
    const api = getSessionApiClient()
    if (!api) return null

    const { data, error, response } = await api.fetch.GET('/api/me/articles')
    if (!data)
      throwRead(error, response.status, '記事一覧の取得に失敗しました。')

    return data.items
  },
)

/** 編集用の記事。自分の記事でなければ null。 */
export const fetchMyArticle = createServerFn({ method: 'GET' })
  .validator((input: { id: number }) => input)
  .handler(async ({ data }) => {
    const { data: article } =
      (await getSessionApiClient()?.fetch.GET('/api/me/articles/{id}', {
        params: { path: { id: data.id } },
      })) ?? {}

    return article ?? null
  })

export const createArticle = createServerFn({ method: 'POST' })
  .validator((input: ArticleInput) => input)
  .handler(async ({ data }) => {
    const api = getSessionApiClient()
    if (!api) return unauthenticated

    const {
      data: article,
      error,
      response,
    } = await api.fetch.POST('/api/me/articles', { body: data })
    if (!article)
      return toFailure(error, response.status, '保存に失敗しました。')

    return { ok: true as const, article }
  })

export const updateArticle = createServerFn({ method: 'POST' })
  .validator((input: { id: number; article: ArticleInput }) => input)
  .handler(async ({ data }) => {
    const api = getSessionApiClient()
    if (!api) return unauthenticated

    const {
      data: article,
      error,
      response,
    } = await api.fetch.PUT('/api/me/articles/{id}', {
      params: { path: { id: data.id } },
      body: data.article,
    })
    if (!article)
      return toFailure(error, response.status, '保存に失敗しました。')

    return { ok: true as const, article }
  })

export const deleteArticle = createServerFn({ method: 'POST' })
  .validator((input: { id: number }) => input)
  .handler(async ({ data }) => {
    const api = getSessionApiClient()
    if (!api) return unauthenticated

    const { error, response } = await api.fetch.DELETE(
      '/api/me/articles/{id}',
      { params: { path: { id: data.id } } },
    )
    if (response.status >= 400)
      return toFailure(error, response.status, '削除に失敗しました。')

    return { ok: true as const }
  })

export const previewArticle = createServerFn({ method: 'POST' })
  .validator((input: { bodyMd: string }) => input)
  .handler(async ({ data }) => {
    const { data: preview } =
      (await getSessionApiClient()?.fetch.POST('/api/me/articles/preview', {
        body: { bodyMd: data.bodyMd },
      })) ?? {}

    return preview ?? null
  })
