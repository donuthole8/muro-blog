import { createServerFn } from '@tanstack/react-start'
import { getSessionApiClient } from './api'
import { toFailure, throwRead, unauthenticated } from './result'
import { deleteImages } from './uploads'

/**
 * 管理画面（投稿・記事の非表示・削除、ユーザーの停止、タグの作成）。
 * 権限は API 側が role=admin で判定する。ここはログイン中の本人として叩くだけ。
 */

export const listModerationPosts = createServerFn({ method: 'GET' })
  .validator((input: { cursor?: string; handle?: string }) => input)
  .handler(async ({ data }) => {
    const api = getSessionApiClient()
    if (!api) throwRead(null, 401, 'ログインが必要です。')

    const {
      data: page,
      error,
      response,
    } = await api.fetch.GET('/api/admin/posts', {
      params: { query: { cursor: data.cursor, handle: data.handle } },
    })
    if (!page) throwRead(error, response.status, '投稿の取得に失敗しました。')

    return page
  })

export const setPostHidden = createServerFn({ method: 'POST' })
  .validator((input: { id: string; hidden: boolean }) => input)
  .handler(async ({ data }) => {
    const api = getSessionApiClient()
    if (!api) return unauthenticated

    const path = data.hidden
      ? ('/api/admin/posts/{id}/hide' as const)
      : ('/api/admin/posts/{id}/unhide' as const)
    const {
      data: post,
      error,
      response,
    } = await api.fetch.POST(path, {
      params: { path: { id: data.id } },
    })
    if (!post) return toFailure(error, response.status, '変更に失敗しました。')

    return { ok: true as const, post }
  })

/** 未判定の投稿を Jev で判定する（1回に最大 20 件。画面が remaining 0 まで繰り返す）。 */
export const moderateBacklog = createServerFn({ method: 'POST' }).handler(
  async () => {
    const api = getSessionApiClient()
    if (!api) return unauthenticated

    const {
      data: result,
      error,
      response,
    } = await api.fetch.POST('/api/admin/posts/moderate')
    if (!result)
      return toFailure(error, response.status, '判定に失敗しました。')

    return { ok: true as const, result }
  },
)

export const deletePostAsAdmin = createServerFn({ method: 'POST' })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const api = getSessionApiClient()
    if (!api) return unauthenticated

    const {
      data: deleted,
      error,
      response,
    } = await api.fetch.DELETE('/api/admin/posts/{id}', {
      params: { path: { id: data.id } },
    })
    if (!deleted)
      return toFailure(error, response.status, '削除に失敗しました。')

    if (deleted.imageKey) {
      await deleteImages([deleted.imageKey])
    }

    return { ok: true as const }
  })

export const listUsers = createServerFn({ method: 'GET' })
  .validator((input: { q?: string }) => input)
  .handler(async ({ data }) => {
    const api = getSessionApiClient()
    if (!api) throwRead(null, 401, 'ログインが必要です。')

    const {
      data: users,
      error,
      response,
    } = await api.fetch.GET('/api/admin/users', {
      params: { query: { q: data.q } },
    })
    if (!users)
      throwRead(error, response.status, 'ユーザーの取得に失敗しました。')

    return users
  })

export const setUserSuspended = createServerFn({ method: 'POST' })
  .validator((input: { id: string; suspended: boolean }) => input)
  .handler(async ({ data }) => {
    const api = getSessionApiClient()
    if (!api) return unauthenticated

    const path = data.suspended
      ? ('/api/admin/users/{id}/suspend' as const)
      : ('/api/admin/users/{id}/unsuspend' as const)
    const {
      data: user,
      error,
      response,
    } = await api.fetch.POST(path, {
      params: { path: { id: data.id } },
    })
    if (!user) return toFailure(error, response.status, '変更に失敗しました。')

    return { ok: true as const, user }
  })

export const listAdminTags = createServerFn({ method: 'GET' }).handler(
  async () => {
    const api = getSessionApiClient()
    if (!api) throwRead(null, 401, 'ログインが必要です。')

    const {
      data: tags,
      error,
      response,
    } = await api.fetch.GET('/api/admin/tags')
    if (!tags) throwRead(error, response.status, 'タグの取得に失敗しました。')

    return tags
  },
)

export const createAdminTag = createServerFn({ method: 'POST' })
  .validator((input: { name: string; slug: string }) => input)
  .handler(async ({ data }) => {
    const api = getSessionApiClient()
    if (!api) return unauthenticated

    const {
      data: tag,
      error,
      response,
    } = await api.fetch.POST('/api/admin/tags', { body: data })
    if (!tag)
      return toFailure(error, response.status, 'タグの作成に失敗しました。')

    return { ok: true as const, tag }
  })

export const listReports = createServerFn({ method: 'GET' })
  .validator((input: { status: 'open' | 'resolved'; cursor?: string }) => input)
  .handler(async ({ data }) => {
    const api = getSessionApiClient()
    if (!api) throwRead(null, 401, 'ログインが必要です。')

    const {
      data: page,
      error,
      response,
    } = await api.fetch.GET('/api/admin/reports', {
      params: { query: { status: data.status, cursor: data.cursor } },
    })
    if (!page) throwRead(error, response.status, '通報の取得に失敗しました。')

    return page
  })

export const dismissReport = createServerFn({ method: 'POST' })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const api = getSessionApiClient()
    if (!api) return unauthenticated

    const {
      data: report,
      error,
      response,
    } = await api.fetch.POST('/api/admin/reports/{id}/dismiss', {
      params: { path: { id: data.id } },
    })
    if (!report)
      return toFailure(error, response.status, '却下に失敗しました。')

    return { ok: true as const, report }
  })

/* ------------------------------------------------------------------ */
/* ブログ記事                                                           */
/* ------------------------------------------------------------------ */

export const listModerationArticles = createServerFn({ method: 'GET' })
  .validator((input: { cursor?: string; handle?: string }) => input)
  .handler(async ({ data }) => {
    const api = getSessionApiClient()
    if (!api) throwRead(null, 401, 'ログインが必要です。')

    const {
      data: page,
      error,
      response,
    } = await api.fetch.GET('/api/admin/articles', {
      params: { query: { cursor: data.cursor, handle: data.handle } },
    })
    if (!page) throwRead(error, response.status, '記事の取得に失敗しました。')

    return page
  })

export const setArticleHidden = createServerFn({ method: 'POST' })
  .validator((input: { id: number; hidden: boolean }) => input)
  .handler(async ({ data }) => {
    const api = getSessionApiClient()
    if (!api) return unauthenticated

    const path = data.hidden
      ? ('/api/admin/articles/{id}/hide' as const)
      : ('/api/admin/articles/{id}/unhide' as const)
    const {
      data: article,
      error,
      response,
    } = await api.fetch.POST(path, {
      params: { path: { id: data.id } },
    })
    if (!article)
      return toFailure(error, response.status, '変更に失敗しました。')

    return { ok: true as const, article }
  })

export const deleteArticleAsAdmin = createServerFn({ method: 'POST' })
  .validator((input: { id: number }) => input)
  .handler(async ({ data }) => {
    const api = getSessionApiClient()
    if (!api) return unauthenticated

    const {
      data: deleted,
      error,
      response,
    } = await api.fetch.DELETE('/api/admin/articles/{id}', {
      params: { path: { id: data.id } },
    })
    if (!deleted)
      return toFailure(error, response.status, '削除に失敗しました。')

    if (deleted.imageKey) await deleteImages([deleted.imageKey])

    return { ok: true as const }
  })
