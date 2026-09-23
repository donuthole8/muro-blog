import { drizzle } from 'drizzle-orm/d1'
import * as schema from './schema'

export function createDb(d1: D1Database) {
  return drizzle(d1, { schema })
}

export type Db = ReturnType<typeof createDb>

export type User = typeof schema.users.$inferSelect
export type Post = typeof schema.posts.$inferSelect
export type Tag = typeof schema.tags.$inferSelect
export type Report = typeof schema.reports.$inferSelect
export type Notification = typeof schema.notifications.$inferSelect
