/** 絵文字を選ばずに保存したときに API 側が入れる既定値（Post::DEFAULT_EMOJI と揃える）。 */
export const DEFAULT_EMOJI = '📝'

/**
 * 絵文字ピッカーの候補。
 *
 * 全絵文字を持つとバンドルが太るため、技術記事で使いそうなものに絞っている。
 * `keywords` は検索用。日本語・英語のどちらでも引けるようにする。
 */
export type EmojiCategory = {
  label: string
  emojis: Array<{ char: string; keywords: string }>
}

export const emojiCategories: Array<EmojiCategory> = [
  {
    label: 'よく使う',
    emojis: [
      { char: '📝', keywords: 'memo メモ 記事 note' },
      { char: '💡', keywords: 'idea アイデア ひらめき tips' },
      { char: '🚀', keywords: 'rocket ロケット リリース release 高速' },
      { char: '🎉', keywords: 'party お祝い 完成 リリース' },
      { char: '🔥', keywords: 'fire 炎 hot 人気' },
      { char: '✨', keywords: 'sparkles キラキラ 新機能 new' },
      { char: '🛠️', keywords: 'tools 道具 設定 リファクタ' },
      { char: '🐛', keywords: 'bug バグ 不具合 fix' },
      { char: '⚡', keywords: 'zap 高速 パフォーマンス performance' },
      { char: '🧪', keywords: 'test テスト 実験 experiment' },
      { char: '📦', keywords: 'package パッケージ 依存 npm' },
      { char: '🔗', keywords: 'link リンク 連携 api' },
    ],
  },
  {
    label: '開発',
    emojis: [
      { char: '💻', keywords: 'laptop pc 開発 coding' },
      { char: '🖥️', keywords: 'desktop デスクトップ 画面' },
      { char: '⌨️', keywords: 'keyboard キーボード 入力' },
      { char: '🖱️', keywords: 'mouse マウス' },
      { char: '💾', keywords: 'save 保存 フロッピー disk' },
      { char: '💿', keywords: 'disc ディスク cd' },
      { char: '🗄️', keywords: 'database db データベース 保管' },
      { char: '🗃️', keywords: 'files ファイル 整理 index' },
      { char: '📁', keywords: 'folder フォルダ ディレクトリ' },
      { char: '📄', keywords: 'document ドキュメント ファイル' },
      { char: '🧩', keywords: 'puzzle プラグイン 部品 component' },
      { char: '⚙️', keywords: 'gear 設定 config 歯車' },
      { char: '🔧', keywords: 'wrench 修正 fix 工具' },
      { char: '🔨', keywords: 'hammer ビルド build' },
      { char: '🏗️', keywords: 'construction 構築 アーキテクチャ' },
      { char: '🧱', keywords: 'brick 基盤 ブロック' },
      { char: '🔍', keywords: 'search 検索 調査 デバッグ' },
      { char: '🔎', keywords: 'search 検索 詳細' },
      { char: '🧹', keywords: 'clean 掃除 リファクタ refactor' },
      { char: '♻️', keywords: 'recycle リファクタ 再利用 refactor' },
      { char: '🔒', keywords: 'lock セキュリティ security 認証' },
      { char: '🔑', keywords: 'key 鍵 認証 token' },
      { char: '🛡️', keywords: 'shield 防御 security 保護' },
      { char: '🧬', keywords: 'dna 構造 型 generics' },
    ],
  },
  {
    label: '記録・分析',
    emojis: [
      { char: '📊', keywords: 'chart グラフ 分析 統計' },
      { char: '📈', keywords: 'up 上昇 成長 改善' },
      { char: '📉', keywords: 'down 下降 削減 コスト' },
      { char: '🗒️', keywords: 'note メモ 記録' },
      { char: '📚', keywords: 'books 本 学習 まとめ' },
      { char: '📖', keywords: 'book 読書 ドキュメント 入門' },
      { char: '🔖', keywords: 'bookmark しおり タグ' },
      { char: '📌', keywords: 'pin ピン 固定 重要' },
      { char: '🗓️', keywords: 'calendar カレンダー 日付 予定' },
      { char: '⏱️', keywords: 'timer 時間 計測 ベンチマーク' },
      { char: '🧮', keywords: 'abacus 計算 アルゴリズム' },
      { char: '🗺️', keywords: 'map 地図 ロードマップ 全体像' },
    ],
  },
  {
    label: '状態',
    emojis: [
      { char: '✅', keywords: 'check 完了 done ok' },
      { char: '❌', keywords: 'cross 失敗 エラー ng' },
      { char: '⚠️', keywords: 'warning 注意 警告' },
      { char: '❓', keywords: 'question 疑問 質問' },
      { char: '❗', keywords: 'exclamation 重要 注意' },
      { char: '🚧', keywords: 'wip 工事中 作業中 未完成' },
      { char: '🏁', keywords: 'finish ゴール 完走' },
      { char: '🎯', keywords: 'target 目標 狙い ターゲット' },
      { char: '🧭', keywords: 'compass 方針 指針 設計' },
      { char: '♾️', keywords: 'infinity 無限 継続' },
      { char: '🆕', keywords: 'new 新規 新機能' },
      { char: '🔁', keywords: 'loop 繰り返し リトライ' },
    ],
  },
  {
    label: 'ひと・気分',
    emojis: [
      { char: '😀', keywords: 'smile 笑顔 楽しい' },
      { char: '😊', keywords: 'happy うれしい 満足' },
      { char: '🤔', keywords: 'thinking 考える 悩む 検討' },
      { char: '😅', keywords: 'sweat 苦笑 大変' },
      { char: '😱', keywords: 'scream 驚き 障害 事故' },
      { char: '😴', keywords: 'sleep 睡眠 休憩' },
      { char: '🙌', keywords: 'hooray 万歳 達成' },
      { char: '👍', keywords: 'good いいね 賛成' },
      { char: '🙏', keywords: 'thanks 感謝 お願い' },
      { char: '🧑‍💻', keywords: 'developer 開発者 エンジニア' },
      { char: '👀', keywords: 'eyes 注目 レビュー review' },
      { char: '🧠', keywords: 'brain 頭脳 学習 ai' },
    ],
  },
  {
    label: 'その他',
    emojis: [
      { char: '🌱', keywords: 'seedling 入門 はじめて 成長' },
      { char: '🌏', keywords: 'earth 地球 世界 i18n' },
      { char: '🌙', keywords: 'moon 夜 ダークモード' },
      { char: '☀️', keywords: 'sun 昼 ライトモード' },
      { char: '☁️', keywords: 'cloud クラウド インフラ' },
      { char: '🐳', keywords: 'docker whale コンテナ' },
      { char: '🐘', keywords: 'php elephant postgres 象' },
      { char: '🦀', keywords: 'rust crab 蟹' },
      { char: '🐍', keywords: 'python snake 蛇' },
      { char: '☕', keywords: 'coffee java 休憩' },
      { char: '🍣', keywords: 'sushi 寿司 日本' },
      { char: '🎨', keywords: 'art デザイン css スタイル' },
      { char: '🎵', keywords: 'music 音楽' },
      { char: '📷', keywords: 'camera 写真 画像' },
      { char: '🎬', keywords: 'movie 動画 video' },
      { char: '🏆', keywords: 'trophy 優勝 成果' },
    ],
  },
]

const allEmojis = emojiCategories.flatMap((category) => category.emojis)

/** キーワードで候補を絞る。空文字ならカテゴリ分けのまま返す。 */
export function searchEmojis(query: string) {
  const q = query.trim().toLowerCase()
  if (q === '') return null

  return allEmojis.filter(
    (emoji) => emoji.char === q || emoji.keywords.toLowerCase().includes(q),
  )
}

export function randomEmoji() {
  return allEmojis[Math.floor(Math.random() * allEmojis.length)].char
}
