import type { ValidationError } from '@blog/api-client'

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

export type Result<T = object> = ({ ok: true } & T) | Failure

export function toFailure(
  error: unknown,
  status: number,
  fallback: string,
): Failure {
  const body = error as Partial<ValidationError> | undefined

  return {
    ok: false,
    message: body?.message ?? fallback,
    // 空のときに [] で返ってくる経路があっても Record として扱えるようにする
    errors: body?.errors && !Array.isArray(body.errors) ? body.errors : {},
    status,
  }
}

export const unauthenticated: Failure = {
  ok: false,
  message: 'ログインが必要です。',
  errors: {},
  status: 401,
}

/** 読み取り系はページ描画そのものが成立しないので例外のままでよい。 */
export function throwRead(
  error: unknown,
  status: number,
  fallback: string,
): never {
  const body = error as Partial<ValidationError> | undefined

  throw new Error(body?.message ?? fallback, { cause: status })
}
