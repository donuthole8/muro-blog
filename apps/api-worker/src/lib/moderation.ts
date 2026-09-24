/**
 * 投稿の不適切さの判定。TypeSafe の Jev（https://docs.typesafe.ai/api）にカテゴリごとの
 * yes/no を尋ね、最も高い確率で段階を決める。
 *
 * - blocked: 自動で非表示にする
 * - sensitive: 「不適切な可能性があります」と折りたたんで出す
 * - ok: そのまま
 *
 * API キー（TYPESAFE_API_KEY）が無い環境では判定しない。失敗したときも投稿は止めない（null を返す）。
 */

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone'
const MODEL = 'jev-latest'
const TIMEOUT_MS = 3000

/** この確率以上なら自動で非表示 */
export const BLOCK_THRESHOLD = 0.85
/** この確率以上なら折りたたむ */
export const SENSITIVE_THRESHOLD = 0.4

export type ModerationLevel = 'ok' | 'sensitive' | 'blocked'

export type ModerationVerdict = {
  level: ModerationLevel
  /** 最も確率が高かったカテゴリ（QUESTIONS のキー） */
  category: string
  score: number
}

/**
 * 尋ねる内容。投稿は日本語の分報（職場の作業ログ）なので、その前提で境界を書いておく。
 * 送るたびに入力トークンになるので、短く保つ。
 */
const QUESTIONS = {
  sexual: {
    type: 'noul',
    instructions: 'Does the message contain sexual content (explicit sexual descriptions, sexual solicitation, or sexualization of anyone)?',
    criteria: {
      true: 'Explicit or suggestive sexual content, sexual harassment, or anything sexualizing minors.',
      false: 'Neutral mentions of relationships, health, or biology; ordinary jokes without sexual content.',
    },
  },
  violence: {
    type: 'noul',
    instructions: 'Does the message contain violent content (threats, incitement, glorification of violence, graphic gore, or encouragement of self-harm)?',
    criteria: {
      true: 'Threatening or inciting harm to people, graphic descriptions of injury, or encouraging suicide or self-harm.',
      false: 'News, history, fiction or games discussed neutrally; hyperbole like "this bug is killing me".',
    },
  },
  harassment: {
    type: 'noul',
    instructions: 'Does the message insult, defame, or attack a person, company, or group (slander, hate speech, discrimination, bullying)?',
    criteria: {
      true: 'Insults or slurs, degrading a real person or company, unfounded damaging claims about them, or hate toward a group.',
      false: 'Fair criticism of products, code, or decisions; self-deprecation; friendly banter.',
    },
  },
  legal: {
    type: 'noul',
    instructions: 'Does the message create legal risk (promoting illegal acts, exposing personal information, leaking confidential or unannounced company information, sharing pirated material, or accusing a real person of a crime without basis)?',
    criteria: {
      true: 'Instructions for crimes, drug dealing, doxxing (addresses, phone numbers, IDs of others), unannounced earnings, deals or other internal company information, insider trading tips, piracy links, or baseless criminal accusations.',
      false: 'Discussing laws or news neutrally, sharing public information, or talking about one\'s own work.',
    },
  },
} as const

type JevResponse = {
  answers?: Record<string, { type: string; noul?: number }>
}

export async function moderateText(apiKey: string | undefined, text: string): Promise<ModerationVerdict | null> {
  if (!apiKey || text.trim() === '') return null

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        state: { message: text, surface: 'a post on a Japanese work-log micro-blog (times)' },
        questions: QUESTIONS,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) {
      console.warn('jev moderation failed', res.status, await res.text().catch(() => ''))
      return null
    }
    return toVerdict((await res.json()) as JevResponse)
  } catch (e) {
    console.warn('jev moderation failed', e)
    return null
  }
}

function toVerdict(body: JevResponse): ModerationVerdict | null {
  let category = ''
  let score = -1
  for (const key of Object.keys(QUESTIONS)) {
    const p = body.answers?.[key]?.noul
    if (typeof p === 'number' && p > score) {
      category = key
      score = p
    }
  }
  if (score < 0) return null

  const level: ModerationLevel =
    score >= BLOCK_THRESHOLD ? 'blocked' : score >= SENSITIVE_THRESHOLD ? 'sensitive' : 'ok'
  return { level, category, score }
}
