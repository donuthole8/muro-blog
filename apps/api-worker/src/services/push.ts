import { eq, inArray } from 'drizzle-orm'
import type { Context } from 'hono'
import type { Db } from '../db/client'
import { pushSubscriptions } from '../db/schema'
import type { AppEnv, Bindings } from '../env'
import { sendPush, type VapidKeys } from '../lib/webPush'
import { inChunks } from './posts'

/**
 * アプリ内の通知と同時に送る Web Push。
 * 通知の行を書いた後、レスポンスを返してから（waitUntil で）送る。送れなくても通知そのものは残る。
 */
export type PushMessage = {
  userId: string
  title: string
  body: string
  /** 通知を押したときに開く、サイト内のパス */
  url: string
}

/** 通知を書いた後に呼ぶ。VAPID 鍵が無ければ何もしない。 */
export type PushSender = (messages: PushMessage[]) => void

export const noPush: PushSender = () => {}

export function vapidKeys(env: Bindings): VapidKeys | null {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null
  return {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT || `https://${env.SITE_HOST}`,
  }
}

export function pushSender(c: Context<AppEnv>): PushSender {
  const keys = vapidKeys(c.env)
  if (!keys) return noPush
  const db = c.var.db
  return (messages) => {
    if (messages.length === 0) return
    c.executionCtx.waitUntil(
      deliver(db, keys, messages).catch((e) => console.warn('push delivery failed', String(e))),
    )
  }
}

async function deliver(db: Db, keys: VapidKeys, messages: PushMessage[]) {
  const userIds = [...new Set(messages.map((m) => m.userId))]
  const subscriptions = await inChunks(userIds, (chunk) =>
    db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.userId, chunk)),
  )

  const gone: number[] = []
  await Promise.all(
    messages.flatMap((message) =>
      subscriptions
        .filter((s) => s.userId === message.userId)
        .map(async (s) => {
          const result = await sendPush(s, { title: message.title, body: message.body, url: message.url }, keys)
          if (result === 'gone') gone.push(s.id)
        }),
    ),
  )
  for (const id of gone) {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id))
  }
}
