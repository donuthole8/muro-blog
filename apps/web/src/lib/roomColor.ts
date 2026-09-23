import type { CSSProperties } from 'react'

/**
 * 部屋ごとの色。
 *
 * times は「1ユーザー1部屋」が核なので、部屋に入ったことが色で分かるようにする。
 * handle から機械的に色相を決めるため、同じ handle なら常に同じ色になり、
 * サーバーで描いた HTML とクライアントの再描画もずれない（保存も通信も不要）。
 *
 * 返すのは色相だけで、明度と彩度は styles.css のテーマ側に残してある。
 * そのためライトでもダークでも、部屋の色がどれになっても読みやすさが保たれる。
 */

/*
 * 色相は全周ではなく寒色帯に絞る。
 * 全周（0〜359）を使うと部屋ごとの差は大きくなるが、橙や黄の部屋が出て
 * サイト全体の色（スカイブルー）から浮く。
 * 190〜309 は水色→空→青→藍→紫で、互いの区別は十分つく。
 * 全周に戻したいときは HUE_START = 0 / HUE_RANGE = 360 にする。
 */
const HUE_START = 190
const HUE_RANGE = 120

export function roomHue(handle: string): number {
  let hash = 0

  for (const ch of handle) {
    // 31 倍して足す古典的な文字列ハッシュ。桁が溢れないよう都度丸める
    hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) % 3600000
  }

  return HUE_START + (hash % HUE_RANGE)
}

/**
 * 要素に当てると、その配下の accent 系（文字・枠・背景）がまとめて部屋の色になる。
 * --accent-h だけを上書きする仕組みは styles.css の :root を参照。
 */
export function roomAccentStyle(handle: string): CSSProperties {
  // CSS カスタムプロパティは React の型に無いので、ここだけキャストする
  return { '--accent-h': roomHue(handle) } as CSSProperties
}
