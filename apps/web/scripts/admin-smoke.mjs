/**
 * 管理画面のミューテーション経路をブラウザと同じ方法で叩く疎通確認。
 *
 * TanStack Start のサーバー関数は seroval でシリアライズした JSON を
 * POST /_serverFn/<id> に送る。ここではその形式を再現している。
 *
 * 使い方: node scripts/admin-smoke.mjs [ポート]
 */
import { fromCrossJSON, toJSONAsync } from 'seroval'

const port = process.argv[2] ?? '3100'
const origin = `http://localhost:${port}`

/** src/lib/admin.ts のエクスポート名からサーバー関数 ID を作る */
function serverFnId(exportName) {
  const meta = {
    file: '/src/lib/admin.ts?tss-serverfn-split',
    export: `${exportName}_createServerFn_handler`,
  }

  return Buffer.from(JSON.stringify(meta))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

async function callServerFn(exportName, data) {
  const body = JSON.stringify(await toJSONAsync({ data }))

  const response = await fetch(
    `${origin}/_serverFn/${serverFnId(exportName)}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tsr-serverFn': 'true',
        // CSRF ミドルウェアが Origin を検査する
        origin,
        referer: `${origin}/admin`,
      },
      body,
    },
  )

  const text = await response.text()

  // レスポンスは seroval の cross-JSON。{ result, error, context } の形。
  let payload = null
  try {
    payload = fromCrossJSON(JSON.parse(text), { refs: new Map() })
  } catch {
    // デシリアライズできない場合は生テキストのまま返す
  }

  return {
    status: response.status,
    result: payload?.result ?? null,
    error: payload?.error ?? null,
    text,
  }
}

const slug = `smoke-${Date.now()}`
let failures = 0
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

console.log('=== 1. プレビュー ===')
const preview = await callServerFn('previewMarkdown', {
  bodyMd: '## 見出し\n\n**太字**と`code`。',
})
check(
  `HTTP ${preview.status} / 保存時と同じ変換結果`,
  preview.status === 200 && preview.result?.bodyHtml?.includes('<strong>'),
  preview.result?.bodyHtml?.replace(/\n/g, ' ').slice(0, 60),
)

console.log('=== 2. 記事の新規作成 ===')
const created = await callServerFn('createAdminPost', {
  title: 'サーバー関数から作成した記事',
  slug,
  bodyMd: '## テスト\n\nミューテーション経路の確認。',
  excerpt: null,
  tagSlugs: ['php'],
})
const createdPost = created.result?.ok ? created.result.post : null
check(
  `HTTP ${created.status} / slug と状態`,
  createdPost?.slug === slug,
  `slug=${createdPost?.slug} status=${createdPost?.status} tags=${createdPost?.tags?.map((t) => t.slug).join(',')}`,
)

const newId = createdPost?.id ?? null
console.log(`  作成された id: ${newId}`)

console.log('=== 3. バリデーションエラーが返るか ===')
const invalid = await callServerFn('createAdminPost', {
  title: '',
  slug: 'BAD_SLUG',
  bodyMd: '',
  excerpt: null,
  tagSlugs: [],
})
const invalidErrors = invalid.result?.ok === false ? invalid.result.errors : {}
check(
  'フィールド単位のエラーが画面まで届く',
  Boolean(invalidErrors.title && invalidErrors.slug && invalidErrors.bodyMd),
  JSON.stringify(invalidErrors),
)

if (newId) {
  console.log('=== 4. 公開 ===')
  const published = await callServerFn('setPostPublished', {
    id: newId,
    published: true,
  })
  const publishedPost = published.result?.ok ? published.result.post : null
  check(
    `HTTP ${published.status}`,
    publishedPost?.status === 'published',
    `status=${publishedPost?.status} publishedAt=${publishedPost?.publishedAt}`,
  )

  console.log('=== 5. 公開APIに現れるか ===')
  const publicRes = await fetch('http://127.0.0.1:8000/api/posts?perPage=50')
  const publicJson = await publicRes.json()
  check(
    '公開一覧に含まれる',
    publicJson.items.some((p) => p.slug === slug),
    `公開記事 ${publicJson.total} 件`,
  )

  console.log('=== 6. 後片付け（削除） ===')
  const deleted = await callServerFn('deleteAdminPost', { id: newId })
  check(`HTTP ${deleted.status}`, deleted.result?.ok === true)
}

console.log(failures === 0 ? '\n全て成功' : `\n${failures} 件失敗`)
process.exit(failures === 0 ? 0 : 1)
