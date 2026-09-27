/**
 * Web Push を受け取る Service Worker。ページのキャッシュ（オフライン対応）はしない。
 *
 * 通知の中身は API（apps/api-worker の services/push.ts）が暗号化して送る
 * { title, body, url }。開いているタブには、未読数を取り直すよう知らせる。
 */
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    // 形の違う通知は既定の文言で出す
  }

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(data.title || 'teatimes', {
        body: data.body || '',
        icon: '/apple-touch-icon.png',
        badge: '/favicon-32x32.png',
        // 同じスレッドの通知は1つにまとめる
        tag: data.url || undefined,
        data: { url: data.url || '/' },
      })
      const windows = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      for (const client of windows) client.postMessage({ type: 'push' })
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(
    (event.notification.data && event.notification.data.url) || '/',
    self.location.origin,
  ).href

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      // 開いているタブがあれば、そこで画面遷移させる（再読み込みさせない）
      const existing = windows.find((client) =>
        client.url.startsWith(self.location.origin),
      )
      if (existing) {
        await existing.focus()
        existing.postMessage({ type: 'navigate', url })
        return
      }
      await self.clients.openWindow(url)
    })(),
  )
})
