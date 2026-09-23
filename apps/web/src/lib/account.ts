import { createServerFn } from '@tanstack/react-start'
import type { components } from '@blog/api-client'
import { getAuthApiClient, getSessionApiClient } from './api'
import { toFailure, throwRead, unauthenticated } from './result'
import {
  clearSessionToken,
  readSessionToken,
  storeSessionToken,
} from './session'
import { getUploadsBucket } from './uploads'

type PostInput = components['schemas']['PostInput']
type PostUpdateInput = components['schemas']['PostUpdateInput']
type MeUpdateInput = components['schemas']['MeUpdateInput']
type ReportInput = components['schemas']['ReportInput']

/**
 * ログイン中の本人として行う操作。すべて Cookie のセッションを Bearer に載せ替えて API を叩く。
 * 応答は人ごとに違うのでエッジキャッシュは通らない。
 */

/** 未ログインなら null（例外にはしない。ヘッダーの出し分けに使うため）。 */
export const getMe = createServerFn({ method: 'GET' }).handler(async () => {
  const api = getSessionApiClient()
  if (!api) return null

  const { data: me } = await api.fetch.GET('/api/me')

  return me ?? null
})

export const updateMe = createServerFn({ method: 'POST' })
  .validator((input: MeUpdateInput) => input)
  .handler(async ({ data }) => {
    const api = getSessionApiClient()
    if (!api) return unauthenticated

    const {
      data: me,
      error,
      response,
    } = await api.fetch.PUT('/api/me', {
      body: data,
    })
    if (!me) return toFailure(error, response.status, '保存に失敗しました。')

    return { ok: true as const, me }
  })

/** 退会。投稿の画像は API から触れないので、ここで R2 からも消す。 */
export const deleteAccount = createServerFn({ method: 'POST' }).handler(
  async () => {
    const api = getSessionApiClient()
    if (!api) return unauthenticated

    const { data, error, response } = await api.fetch.DELETE('/api/me')
    if (!data)
      return toFailure(error, response.status, '退会処理に失敗しました。')

    await deleteImages(data.imageKeys)
    clearSessionToken()

    return { ok: true as const }
  },
)

export const logout = createServerFn({ method: 'POST' }).handler(async () => {
  const token = readSessionToken()
  if (token) {
    await getSessionApiClient()?.fetch.DELETE('/api/auth/session')
  }
  clearSessionToken()

  return { ok: true as const }
})

/**
 * 開発用ログイン（Google の設定なしで動作確認するため）。
 * API 側が APP_ENV=dev かつ DEV_LOGIN_ENABLED=1 のときしか通らない。
 */
export const devLogin = createServerFn({ method: 'POST' })
  .validator((input: { handle: string }) => input)
  .handler(async ({ data }) => {
    const {
      data: session,
      error,
      response,
    } = await getAuthApiClient().fetch.POST('/api/auth/dev-login', {
      body: { handle: data.handle },
    })
    if (!session)
      return toFailure(error, response.status, 'ログインに失敗しました。')

    storeSessionToken(session.token, session.expiresAt)

    return { ok: true as const, needsHandle: session.needsHandle }
  })

/**
 * 画面に並んでいる投稿について、自分がリアクション済みの絵文字と、
 * （handle を渡せば）その部屋をフォローしているか。
 */
export const getViewerState = createServerFn({ method: 'GET' })
  .validator((input: { postIds: Array<string>; handle?: string }) => input)
  .handler(async ({ data }) => {
    const api = getSessionApiClient()
    if (!api) return null

    const { data: state } = await api.fetch.GET('/api/me/viewer-state', {
      params: {
        query: { postIds: data.postIds.join(','), handle: data.handle },
      },
    })

    return state ?? null
  })

export const createPost = createServerFn({ method: 'POST' })
  .validator((input: PostInput) => input)
  .handler(async ({ data }) => {
    const api = getSessionApiClient()
    if (!api) return unauthenticated

    const {
      data: post,
      error,
      response,
    } = await api.fetch.POST('/api/posts', { body: data })
    if (!post) return toFailure(error, response.status, '投稿に失敗しました。')

    return { ok: true as const, post }
  })

/** 編集用の Markdown 原文（本人の投稿のみ）。 */
export const fetchPostSource = createServerFn({ method: 'GET' })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const { data: source } =
      (await getSessionApiClient()?.fetch.GET('/api/posts/{id}/source', {
        params: { path: { id: data.id } },
      })) ?? {}

    return source ?? null
  })

export const updatePost = createServerFn({ method: 'POST' })
  .validator((input: { id: string; post: PostUpdateInput }) => input)
  .handler(async ({ data }) => {
    const api = getSessionApiClient()
    if (!api) return unauthenticated

    const {
      data: post,
      error,
      response,
    } = await api.fetch.PUT('/api/posts/{id}', {
      params: { path: { id: data.id } },
      body: data.post,
    })
    if (!post) return toFailure(error, response.status, '編集に失敗しました。')

    return { ok: true as const, post }
  })

export const deletePost = createServerFn({ method: 'POST' })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const api = getSessionApiClient()
    if (!api) return unauthenticated

    const {
      data: deleted,
      error,
      response,
    } = await api.fetch.DELETE('/api/posts/{id}', {
      params: { path: { id: data.id } },
    })
    if (!deleted)
      return toFailure(error, response.status, '削除に失敗しました。')

    if (deleted.imageKey) await deleteImages([deleted.imageKey])

    return { ok: true as const }
  })

export const setReaction = createServerFn({ method: 'POST' })
  .validator((input: { postId: string; emoji: string; on: boolean }) => input)
  .handler(async ({ data }) => {
    const api = getSessionApiClient()
    if (!api) return unauthenticated

    const options = {
      params: { path: { id: data.postId, emoji: data.emoji } },
    }
    const { error, response } = data.on
      ? await api.fetch.PUT('/api/posts/{id}/reactions/{emoji}', options)
      : await api.fetch.DELETE('/api/posts/{id}/reactions/{emoji}', options)

    if (response.status >= 400)
      return toFailure(error, response.status, 'リアクションに失敗しました。')

    return { ok: true as const }
  })

export const setFollowing = createServerFn({ method: 'POST' })
  .validator((input: { handle: string; on: boolean }) => input)
  .handler(async ({ data }) => {
    const api = getSessionApiClient()
    if (!api) return unauthenticated

    const options = { params: { path: { handle: data.handle } } }
    const { error, response } = data.on
      ? await api.fetch.PUT('/api/follows/{handle}', options)
      : await api.fetch.DELETE('/api/follows/{handle}', options)

    if (response.status >= 400)
      return toFailure(error, response.status, 'フォローの変更に失敗しました。')

    return { ok: true as const }
  })

/** 部屋を開いたら既読にする（フォローしていなければ API 側で何もしない）。 */
export const markRoomRead = createServerFn({ method: 'POST' })
  .validator((input: { handle: string }) => input)
  .handler(async ({ data }) => {
    await getSessionApiClient()?.fetch.POST('/api/follows/{handle}/read', {
      params: { path: { handle: data.handle } },
    })

    return { ok: true as const }
  })

export const fetchFollowing = createServerFn({ method: 'GET' }).handler(
  async () => {
    const api = getSessionApiClient()
    if (!api) return null

    const { data, error, response } = await api.fetch.GET('/api/following')
    if (!data)
      throwRead(
        error,
        response.status,
        'フォロー中の部屋の取得に失敗しました。',
      )

    return data
  },
)

export const fetchNotifications = createServerFn({ method: 'GET' })
  .validator((input: { cursor?: string }) => input)
  .handler(async ({ data }) => {
    const api = getSessionApiClient()
    if (!api) return null

    const {
      data: page,
      error,
      response,
    } = await api.fetch.GET('/api/notifications', {
      params: { query: { cursor: data.cursor } },
    })
    if (!page) throwRead(error, response.status, '通知の取得に失敗しました。')

    return page
  })

export const markNotificationsRead = createServerFn({ method: 'POST' }).handler(
  async () => {
    await getSessionApiClient()?.fetch.POST('/api/notifications/read')

    return { ok: true as const }
  },
)

/* ------------------------------------------------------------------ */
/* 通報・ブロック                                                        */
/* ------------------------------------------------------------------ */

export const reportPost = createServerFn({ method: 'POST' })
  .validator((input: { id: string; report: ReportInput }) => input)
  .handler(async ({ data }) => {
    const api = getSessionApiClient()
    if (!api) return unauthenticated

    const { error, response } = await api.fetch.POST('/api/posts/{id}/report', {
      params: { path: { id: data.id } },
      body: data.report,
    })
    if (response.status >= 400)
      return toFailure(error, response.status, '通報に失敗しました。')

    return { ok: true as const }
  })

export const setBlocking = createServerFn({ method: 'POST' })
  .validator((input: { handle: string; on: boolean }) => input)
  .handler(async ({ data }) => {
    const api = getSessionApiClient()
    if (!api) return unauthenticated

    const options = { params: { path: { handle: data.handle } } }
    const { error, response } = data.on
      ? await api.fetch.PUT('/api/blocks/{handle}', options)
      : await api.fetch.DELETE('/api/blocks/{handle}', options)

    if (response.status >= 400)
      return toFailure(error, response.status, 'ブロックの変更に失敗しました。')

    return { ok: true as const }
  })

export const fetchBlocks = createServerFn({ method: 'GET' }).handler(
  async () => {
    const api = getSessionApiClient()
    if (!api) return null

    const { data, error, response } = await api.fetch.GET('/api/blocks')
    if (!data)
      throwRead(error, response.status, 'ブロック一覧の取得に失敗しました。')

    return data
  },
)

/* ------------------------------------------------------------------ */
/* 画像                                                                 */
/* ------------------------------------------------------------------ */

/** 縮小はブラウザ側（lib/image.ts）で済ませてから送る。ここは最後の砦の上限。 */
const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
}

export type UploadImageResult =
  { ok: true; key: string } | { ok: false; message: string }

/**
 * 投稿に添える画像を R2 に保存し、キーを返す。
 *
 * キーの先頭に投稿者の ID を埋め込み、API 側は投稿時に
 * 「自分がアップロードした画像か」をこれで照合する。
 */
export const uploadPostImage = createServerFn({ method: 'POST' })
  .validator((input: { contentType: string; bytes: Uint8Array }) => input)
  .handler(async ({ data }): Promise<UploadImageResult> => {
    const api = getSessionApiClient()
    if (!api) return { ok: false, message: 'ログインが必要です。' }

    const ext = IMAGE_EXTENSIONS[data.contentType]
    if (!ext) {
      return {
        ok: false,
        message: '対応していない画像形式です（PNG / JPEG / GIF / WebP のみ）。',
      }
    }
    if (data.bytes.byteLength > MAX_IMAGE_BYTES) {
      return { ok: false, message: '画像が大きすぎます（2MB まで）。' }
    }

    // API がレート制限を数え、通ったときだけ R2 に置く（連続アップロードで無料枠を削らせない）
    const {
      data: ticket,
      error,
      response,
    } = await api.fetch.POST('/api/me/uploads')
    if (!ticket) {
      const failure = toFailure(
        error,
        response.status,
        '画像のアップロードに失敗しました。',
      )
      return { ok: false, message: failure.message }
    }

    const key = `u_${ticket.userId}_${crypto.randomUUID()}.${ext}`
    await getUploadsBucket().put(key, data.bytes, {
      httpMetadata: { contentType: data.contentType },
    })

    return { ok: true, key }
  })

async function deleteImages(keys: Array<string>) {
  if (keys.length === 0) return
  try {
    await getUploadsBucket().delete(keys)
  } catch {
    // 画像が消せなくても投稿の削除自体は成立させる（孤児は後で掃除できる）
  }
}
