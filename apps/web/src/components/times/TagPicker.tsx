import { useState } from 'react'
import type { TagWithCount } from '@blog/api-client'
import { Icon } from '../Icon'

const MAX_TAGS = 3
const MAX_TAG_NAME_LENGTH = 32
/** 候補として並べる既存タグの数（投稿数の多い順） */
const TAG_SUGGESTIONS = 8

/** API（api-worker の normalizeTagName）と同じ正規化。先頭の # を落とし、空白はハイフンに。 */
function normalizeTagName(raw: string) {
  return raw.trim().replace(/^#+/, '').trim().replace(/\s+/g, '-')
}

/**
 * タグの選択。既存のタグを候補から選ぶか、名前を入力して Enter で新しいタグを付ける
 * （新しいタグは投稿したときに作られる）。
 */
export function TagPicker({
  tags,
  tagSlugs,
  newTags,
  onChange,
}: {
  tags: Array<TagWithCount>
  tagSlugs: Array<string>
  newTags: Array<string>
  onChange: (tagSlugs: Array<string>, newTags: Array<string>) => void
}) {
  const [input, setInput] = useState('')
  const full = tagSlugs.length + newTags.length >= MAX_TAGS
  const query = normalizeTagName(input).toLowerCase()

  const selected = [
    ...tags
      .filter((tag) => tagSlugs.includes(tag.slug))
      .map((tag) => ({ key: tag.slug, name: tag.name, isNew: false })),
    ...newTags.map((name) => ({ key: `new:${name}`, name, isNew: true })),
  ]
  const suggestions = tags
    .filter(
      (tag) =>
        !tagSlugs.includes(tag.slug) &&
        (query === '' ||
          tag.name.toLowerCase().includes(query) ||
          tag.slug.includes(query)),
    )
    .slice(0, TAG_SUGGESTIONS)

  const pick = (slug: string) => {
    if (full || tagSlugs.includes(slug)) return
    onChange([...tagSlugs, slug], newTags)
    setInput('')
  }

  const add = () => {
    const name = normalizeTagName(input)
    if (name === '' || full) return
    // 既にあるタグと同じ名前ならそれを選ぶ（大文字・小文字は区別しない）
    const existing = tags.find(
      (tag) =>
        tag.name.toLowerCase() === name.toLowerCase() ||
        tag.slug === name.toLowerCase(),
    )
    if (existing) {
      pick(existing.slug)
      return
    }
    if (!newTags.some((n) => n.toLowerCase() === name.toLowerCase())) {
      onChange(tagSlugs, [...newTags, name])
    }
    setInput('')
  }

  const remove = (item: (typeof selected)[number]) => {
    if (item.isNew) {
      onChange(
        tagSlugs,
        newTags.filter((n) => n !== item.name),
      )
    } else {
      onChange(
        tagSlugs.filter((s) => s !== item.key),
        newTags,
      )
    }
  }

  const chip =
    'inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full border px-2.5 text-xs transition-colors'

  return (
    // 狭い画面では候補を折り返さず横スクロールの1行にして、画面下の入力欄が縦に伸びないようにする
    <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] sm:flex-wrap sm:overflow-visible">
      {selected.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => remove(item)}
          aria-label={`タグ「${item.name}」を外す`}
          title={item.isNew ? '新しいタグ（投稿すると作られます）' : undefined}
          className={`${chip} border-accent bg-accent-soft text-accent`}
        >
          #{item.name}
          {item.isNew && <span className="text-[0.6rem] opacity-70">new</span>}
          <Icon name="x" className="h-3 w-3" />
        </button>
      ))}

      {!full && (
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return
            if (e.key === 'Enter' || e.key === ',' || e.key === '、') {
              e.preventDefault()
              add()
            } else if (e.key === 'Backspace' && input === '') {
              const last = selected.at(-1)
              if (last) remove(last)
            }
          }}
          onBlur={add}
          maxLength={MAX_TAG_NAME_LENGTH + 1}
          placeholder={selected.length === 0 ? '#タグを追加（Enter）' : '#追加'}
          aria-label="タグを追加"
          className="min-h-8 w-36 shrink-0 rounded-full border border-dashed border-border bg-transparent px-2.5 text-xs focus:border-accent focus:outline-none"
        />
      )}

      {!full &&
        suggestions.map((tag) => (
          <button
            key={tag.slug}
            type="button"
            // 入力欄の blur（= 入力中の名前を追加）より先に選ばせる
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pick(tag.slug)}
            className={`${chip} border-border text-text-muted hover:border-accent`}
          >
            #{tag.name}
          </button>
        ))}

      {!full &&
        query !== '' &&
        !tags.some((tag) => tag.name.toLowerCase() === query) && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={add}
            className={`${chip} border-dashed border-accent text-accent`}
          >
            <Icon name="plus" className="h-3 w-3" />「{normalizeTagName(input)}
            」を作る
          </button>
        )}
    </div>
  )
}
