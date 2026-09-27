import { useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  deletePushSubscription,
  fetchPushConfig,
  savePushSubscription,
} from './account'

/**
 * Web Push の購読（ブラウザ側）。Service Worker は public/sw.js。
 *
 * iPhone / iPad は、ホーム画面に追加したとき（iOS 16.4 以降）だけ使える。
 */
const SW_URL = '/sw.js'

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export async function currentPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null
  const registration = await navigator.serviceWorker.getRegistration('/')
  return (await registration?.pushManager.getSubscription()) ?? null
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(
    base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '='),
  )
  return Uint8Array.from(binary, (ch) => ch.charCodeAt(0))
}

/** 通知の許可を求めて購読し、API に登録する。失敗したら理由を投げる。 */
export async function enablePush(): Promise<void> {
  if (!isPushSupported()) {
    throw new Error('このブラウザはプッシュ通知に対応していません。')
  }
  const { publicKey } = await fetchPushConfig()
  if (!publicKey) {
    throw new Error('サーバーでプッシュ通知が設定されていません。')
  }
  if ((await Notification.requestPermission()) !== 'granted') {
    throw new Error(
      '通知が許可されませんでした。ブラウザの設定から許可してください。',
    )
  }

  const registration = await navigator.serviceWorker.register(SW_URL)
  await navigator.serviceWorker.ready
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(publicKey),
    }))

  const { endpoint, keys } = subscription.toJSON()
  if (!endpoint || !keys?.p256dh || !keys.auth) {
    throw new Error('購読の情報を取得できませんでした。')
  }
  const result = await savePushSubscription({
    data: { endpoint, p256dh: keys.p256dh, auth: keys.auth },
  })
  if (!result.ok) throw new Error(result.message)
}

/** この端末の購読をやめる。ログアウトの前にも呼ぶ（別の人の通知が届き続けないように）。 */
export async function disablePush(): Promise<void> {
  const subscription = await currentPushSubscription()
  if (!subscription) return
  await deletePushSubscription({ data: { endpoint: subscription.endpoint } })
  await subscription.unsubscribe()
}

/**
 * Service Worker からの知らせを受ける。
 * - push: 通知が届いた → 未読数と通知一覧を取り直す（常時ポーリングの代わり）
 * - navigate: 通知が押された → このタブでその画面へ
 */
export function useServiceWorkerMessages() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isPushSupported()) return
    const onMessage = (
      event: MessageEvent<{ type?: string; url?: string }>,
    ) => {
      if (event.data.type === 'push') {
        void queryClient.invalidateQueries({ queryKey: ['me'] })
        void queryClient.invalidateQueries({ queryKey: ['notifications'] })
      }
      if (event.data.type === 'navigate' && event.data.url) {
        const url = new URL(event.data.url)
        if (url.origin === window.location.origin) {
          void navigate({ href: url.pathname + url.search + url.hash })
        }
      }
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () =>
      navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [queryClient, navigate])
}

/**
 * タブのタイトルの先頭に未読の通知数を付ける（「(3) teatimes」）。
 * 各ページの head が後から title を書き換えるので、変わるたびに付け直す。
 */
export function useUnreadTitle(count: number) {
  useEffect(() => {
    const prefix = /^\(\d+\+?\) /
    const apply = () => {
      const base = document.title.replace(prefix, '')
      const next = count > 0 ? `(${count > 99 ? '99+' : count}) ${base}` : base
      if (document.title !== next) document.title = next
    }
    apply()
    const observer = new MutationObserver(apply)
    observer.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
    })
    return () => observer.disconnect()
  }, [count])
}
