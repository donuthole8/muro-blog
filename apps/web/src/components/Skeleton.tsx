/**
 * 読み込み中の骨組み。
 * データが来るまで何も描かないと画面が真っ白になるので、
 * 出来上がりと同じ形の灰色を置いて場所を確保する。
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded bg-border motion-reduce:animate-none ${className}`}
    />
  )
}

/** 投稿一覧（ロビー・部屋・タグ）の骨組み。 */
export function PostListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div role="status" aria-label="読み込み中">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex gap-3 border-b border-border px-1 py-4">
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** 部屋のヘッダー（アイコン・表示名・自己紹介）の骨組み。 */
export function RoomHeaderSkeleton() {
  return (
    <div
      role="status"
      aria-label="読み込み中"
      className="flex items-start gap-4 border-b border-border pb-6"
    >
      <Skeleton className="h-16 w-16 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2.5">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-3.5 w-full max-w-sm" />
        <Skeleton className="h-3.5 w-32" />
      </div>
    </div>
  )
}
