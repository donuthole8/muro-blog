import type { Context } from 'hono'
import { ApiError } from './http'

/**
 * リクエストボディの検査。Symfony の MapRequestPayload + Validator の代わり。
 * 違反はフィールドごとに集めて、まとめて 422 で返す。
 */
export class Input {
  private readonly errors: Record<string, string> = {}

  private constructor(private readonly body: Record<string, unknown>) {}

  static async from(c: Context): Promise<Input> {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      throw new ApiError(400, 'リクエストの JSON が不正です。')
    }
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new ApiError(400, 'リクエストの JSON が不正です。')
    }
    return new Input(body as Record<string, unknown>)
  }

  /** 必須の文字列。 */
  string(
    field: string,
    { max, required = false, requiredMessage, maxMessage }: StringRule,
  ): string {
    const value = this.body[field] ?? ''
    if (typeof value !== 'string') {
      this.fail(field, '文字列で指定してください。')
      return ''
    }
    if (required && value.trim() === '') {
      this.fail(field, requiredMessage ?? 'この項目は必須です。')
    } else if (max !== undefined && [...value].length > max) {
      this.fail(field, maxMessage ?? `${max} 文字以内で入力してください。`)
    }
    return value
  }

  /** 省略可（null 可）の文字列。 */
  optionalString(field: string, rule: StringRule = {}): string | null {
    const value = this.body[field]
    if (value === undefined || value === null) return null
    return this.string(field, rule)
  }

  /** 省略可（null 可）の正の整数（ID など）。 */
  optionalId(field: string): number | null {
    const value = this.body[field]
    if (value === undefined || value === null) return null
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
      this.fail(field, 'ID が不正です。')
      return null
    }
    return value
  }

  /** 文字列の配列。 */
  stringList(
    field: string,
    { maxCount, maxCountMessage, pattern, patternMessage }: ListRule,
  ): string[] {
    const value = this.body[field] ?? []
    if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
      this.fail(field, '文字列の配列で指定してください。')
      return []
    }
    if (maxCount !== undefined && value.length > maxCount) {
      this.fail(field, maxCountMessage ?? `${maxCount} 個までです。`)
    } else if (pattern && value.some((v: string) => !pattern.test(v))) {
      this.fail(field, patternMessage ?? '値が不正です。')
    }
    return value as string[]
  }

  fail(field: string, message: string) {
    this.errors[field] ??= message
  }

  /** ここまでに違反があれば 422 を投げる。 */
  assertValid() {
    if (Object.keys(this.errors).length > 0) {
      throw new ApiError(422, '入力内容に誤りがあります。', this.errors)
    }
  }
}

type StringRule = {
  max?: number
  required?: boolean
  requiredMessage?: string
  maxMessage?: string
}

type ListRule = {
  maxCount?: number
  maxCountMessage?: string
  pattern?: RegExp
  patternMessage?: string
}

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
