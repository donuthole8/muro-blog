import { createServerFn } from '@tanstack/react-start'
import { notFound } from '@tanstack/react-router'
import type { components } from '@blog/api-client'
import { getAdminApiClient } from './api'

export type PostInput = components['schemas']['PostInput']
export type PostAdminSummary = components['schemas']['PostAdminSummary']
export type PostAdminDetail = components['schemas']['PostAdminDetail']
export type ValidationError = components['schemas']['ValidationError']

/**
 * 書き込み系サーバー関数の戻り値。
 *
 * 例外を投げるとクラス情報が RPC 境界を越えられず
 * （seroval が素の Error に落とすため instanceof が効かない）、
 * フィールド単位のエラーを画面で拾えなくなる。
 * そのため成否を素のオブジェクトで返す。
 */
export type Failure = {
  ok: false
  message: string
  /** フィールド名 => エラーメッセージ */
  errors: Record<string, string>
  status: number
}

export type Result<T> = ({ ok: true } & T) | Failure

function toFailure(error: unknown, status: number, fallback: string): Failure {
  const body = error as ValidationError | undefined

  return {
    ok: false,
    message: body?.message ?? fallback,
    errors: body?.errors ?? {},
    status,
  }
}

/** 読み取り系はページ描画そのものが成立しないので例外のままでよい。 */
function throwRead(error: unknown, status: number, fallback: string): never {
  const body = error as ValidationError | undefined

  throw new Error(body?.message ?? fallback, { cause: status })
}

export const listAdminPosts = createServerFn({ method: 'GET' })
  .validator((input: { status?: 'draft' | 'published' }) => input)
  .handler(async ({ data }) => {
    const {
      data: posts,
      error,
      response,
    } = await getAdminApiClient().fetch.GET('/api/admin/posts', {
      params: { query: { status: data.status } },
    })

    if (!posts)
      throwRead(error, response.status, '記事一覧の取得に失敗しました。')

    return posts
  })

export const getAdminPost = createServerFn({ method: 'GET' })
  .validator((input: { id: number }) => input)
  .handler(async ({ data }) => {
    const { data: post, response } = await getAdminApiClient().fetch.GET(
      '/api/admin/posts/{id}',
      { params: { path: { id: data.id } } },
    )

    if (response.status === 404) throw notFound()
    if (!post) throw new Error('記事の取得に失敗しました。')

    return post
  })

export const listAdminTags = createServerFn({ method: 'GET' }).handler(
  async () => {
    const {
      data: tags,
      error,
      response,
    } = await getAdminApiClient().fetch.GET('/api/admin/tags')

    if (!tags) throwRead(error, response.status, 'タグの取得に失敗しました。')

    return tags
  },
)

export const createAdminPost = createServerFn({ method: 'POST' })
  .validator((input: PostInput) => input)
  .handler(async ({ data }) => {
    const {
      data: post,
      error,
      response,
    } = await getAdminApiClient().fetch.POST('/api/admin/posts', { body: data })

    if (!post)
      return toFailure(error, response.status, '記事の作成に失敗しました。')

    return { ok: true as const, post }
  })

export const updateAdminPost = createServerFn({ method: 'POST' })
  .validator((input: { id: number; post: PostInput }) => input)
  .handler(async ({ data }) => {
    const {
      data: post,
      error,
      response,
    } = await getAdminApiClient().fetch.PUT('/api/admin/posts/{id}', {
      params: { path: { id: data.id } },
      body: data.post,
    })

    if (!post)
      return toFailure(error, response.status, '記事の更新に失敗しました。')

    return { ok: true as const, post }
  })

export const setPostPublished = createServerFn({ method: 'POST' })
  .validator((input: { id: number; published: boolean }) => input)
  .handler(async ({ data }) => {
    const path = data.published
      ? ('/api/admin/posts/{id}/publish' as const)
      : ('/api/admin/posts/{id}/unpublish' as const)

    const {
      data: post,
      error,
      response,
    } = await getAdminApiClient().fetch.POST(path, {
      params: { path: { id: data.id } },
    })

    if (!post)
      return toFailure(error, response.status, '公開状態の変更に失敗しました。')

    return { ok: true as const, post }
  })

export const deleteAdminPost = createServerFn({ method: 'POST' })
  .validator((input: { id: number }) => input)
  .handler(async ({ data }) => {
    const { error, response } = await getAdminApiClient().fetch.DELETE(
      '/api/admin/posts/{id}',
      { params: { path: { id: data.id } } },
    )

    if (response.status >= 400) {
      return toFailure(error, response.status, '記事の削除に失敗しました。')
    }

    return { ok: true as const }
  })

export const createAdminTag = createServerFn({ method: 'POST' })
  .validator((input: { name: string; slug: string }) => input)
  .handler(async ({ data }) => {
    const {
      data: tag,
      error,
      response,
    } = await getAdminApiClient().fetch.POST('/api/admin/tags', { body: data })

    if (!tag)
      return toFailure(error, response.status, 'タグの作成に失敗しました。')

    return { ok: true as const, tag }
  })

/** 保存時と同じ変換器でプレビュー用の HTML を作る。 */
export const previewMarkdown = createServerFn({ method: 'POST' })
  .validator((input: { bodyMd: string }) => input)
  .handler(async ({ data }) => {
    const { data: preview } = await getAdminApiClient().fetch.POST(
      '/api/admin/preview',
      { body: { bodyMd: data.bodyMd } },
    )

    if (!preview) throw new Error('プレビューの生成に失敗しました。')

    return preview
  })
