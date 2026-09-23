import { useEffect, useRef, useState } from 'react'

export type ComposerDraft = {
  body: string
  tagSlugs: Array<string>
  /** まだ無いタグの名前（投稿時に作られる） */
  newTags: Array<string>
  /** アップロード済みの画像のキー（プレビューはキーから作り直せる） */
  imageKey: string | null
}

const SAVE_DELAY_MS = 400

/**
 * 入力欄の書きかけを localStorage に残す（部屋・スレッドごと）。
 *
 * タブに戻ったときの再取得やリロードで書きかけが消えないようにするためのもの。
 * 保存はこのブラウザだけで、失敗しても（プライベートモードなど）入力欄はそのまま使える。
 * 復元はマウント後に行う（サーバーの HTML は常に空欄なので、ハイドレーションをずらさない）。
 */
export function useDraft(
  key: string | null,
  current: ComposerDraft,
  restore: (draft: ComposerDraft) => void,
  { paused }: { paused: boolean },
) {
  const [restored, setRestored] = useState(false)
  const loaded = useRef(false)

  // 最初に1回だけ読み込む。読み込む前に空の状態で上書きしないよう loaded で守る
  useEffect(() => {
    if (!key || loaded.current) return
    loaded.current = true

    const draft = read(key)
    if (draft) {
      restore(draft)
      setRestored(true)
    }
    // restore は毎回作り直される関数なので依存に入れない（初回だけ呼べばよい）
  }, [key])

  const { body, tagSlugs, newTags, imageKey } = current
  useEffect(() => {
    // 送信中は書かない。送信に失敗したら入力が戻るので、そのとき改めて保存される
    if (!key || !loaded.current || paused) return

    const timer = setTimeout(() => {
      write(key, { body, tagSlugs, newTags, imageKey })
    }, SAVE_DELAY_MS)

    return () => clearTimeout(timer)
  }, [key, body, tagSlugs, newTags, imageKey, paused])

  return {
    /** 前回の書きかけを戻したか（「下書きを復元しました」の表示用） */
    restored,
    dismissRestored: () => setRestored(false),
    clear: () => {
      if (key) remove(key)
      setRestored(false)
    },
  }
}

export function draftKey(handle: string, parentId?: string) {
  return `teatimes:draft:${handle}:${parentId ?? 'room'}`
}

function isEmpty(draft: ComposerDraft) {
  return (
    draft.body.trim() === '' &&
    draft.tagSlugs.length === 0 &&
    draft.newTags.length === 0 &&
    draft.imageKey === null
  )
}

function read(key: string): ComposerDraft | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<ComposerDraft>
    const draft: ComposerDraft = {
      body: typeof value.body === 'string' ? value.body : '',
      tagSlugs: Array.isArray(value.tagSlugs)
        ? value.tagSlugs.filter((s): s is string => typeof s === 'string')
        : [],
      newTags: Array.isArray(value.newTags)
        ? value.newTags.filter((s): s is string => typeof s === 'string')
        : [],
      imageKey: typeof value.imageKey === 'string' ? value.imageKey : null,
    }

    return isEmpty(draft) ? null : draft
  } catch {
    return null
  }
}

function write(key: string, draft: ComposerDraft) {
  try {
    if (isEmpty(draft)) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(draft))
  } catch {
    // 保存できなくても入力は続けられる
  }
}

function remove(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    // 同上
  }
}
