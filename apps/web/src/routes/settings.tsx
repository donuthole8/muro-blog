import { useEffect, useRef, useState } from 'react'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Me } from '@blog/api-client'
import { Button } from '../components/Button'
import { Avatar } from '../components/times/Avatar'
import { StatusEditor } from '../components/times/StatusEditor'
import { PageHeader } from '../components/PageHeader'
import {
  deleteAccount,
  removeAvatar,
  updateMe,
  updateMutedWords,
  uploadAvatar,
} from '../lib/account'
import { prepareAvatar } from '../lib/image'
import {
  currentPushSubscription,
  disablePush,
  enablePush,
  isPushSupported,
} from '../lib/push'
import { blocksQuery, meQuery, mutesQuery, useMe } from '../lib/queries'
import { useBlockToggle } from '../lib/useBlockToggle'
import { useMuteToggle } from '../lib/useMuteToggle'
import { loginUrl, site } from '../lib/site'

export const Route = createFileRoute('/settings')({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery)
    if (!me)
      throw redirect({ href: loginUrl('/settings'), reloadDocument: true })

    return { me }
  },
  head: () => ({
    meta: [
      { title: `設定 | ${site.title}` },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: Settings,
})

function Settings() {
  const { me } = Route.useRouteContext()

  return (
    <div>
      <PageHeader title="設定" />
      <div className="space-y-12">
        <AvatarForm />
        <ProfileForm me={me} />
        <StatusSection />
        <PushSettings />
        <MuteSettings />
        <BlockList />
        <DeleteAccount me={me} />
      </div>
    </div>
  )
}

/** アイコン。アップロードした画像は中央を正方形に切り抜いて縮めてから送る。 */
function AvatarForm() {
  // アイコンを変えるとすぐ反映したいので、ルートの me ではなくクエリの me を見る
  const me = useMe()
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  const applyMe = (next: Me) => {
    queryClient.setQueryData(meQuery.queryKey, next)
    if (next.handle) {
      void queryClient.invalidateQueries({ queryKey: ['room', next.handle] })
    }
  }

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const { blob, contentType } = await prepareAvatar(file)
      return uploadAvatar({
        data: { contentType, bytes: new Uint8Array(await blob.arrayBuffer()) },
      })
    },
    onMutate: () => setError(null),
    onSuccess: (result) => {
      if (result.ok) applyMe(result.me)
      else setError(result.message)
    },
    onError: (e) =>
      setError(
        e instanceof Error ? e.message : 'アイコンの変更に失敗しました。',
      ),
    onSettled: () => {
      if (fileRef.current) fileRef.current.value = ''
    },
  })

  const remove = useMutation({
    mutationFn: () => removeAvatar(),
    onSuccess: (result) => {
      if (result.ok) applyMe(result.me)
      else setError(result.message)
    },
  })

  if (!me) return null

  return (
    <section>
      <h2 className="text-lg font-bold">アイコン</h2>
      <div className="mt-4 flex items-center gap-4">
        <Avatar user={me} size="lg" />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={upload.isPending || !me.emailVerified}
            onClick={() => fileRef.current?.click()}
          >
            {upload.isPending ? 'アップロード中…' : '画像を選ぶ'}
          </Button>
          {me.hasCustomAvatar && (
            <Button
              variant="ghost"
              size="sm"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              元に戻す
            </Button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) upload.mutate(file)
            }}
          />
        </div>
      </div>
      <p className="mt-2 text-xs text-text-muted">
        {me.emailVerified
          ? '正方形に切り抜いて表示します。「元に戻す」と Google のアイコン（なければ頭文字）になります。'
          : 'メールアドレスの確認が済むと変更できます。'}
      </p>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </section>
  )
}

function StatusSection() {
  const me = useMe()
  if (!me) return null

  return (
    <section>
      <h2 className="text-lg font-bold">今の状態</h2>
      <p className="mt-1 mb-4 text-xs text-text-muted">
        部屋の見出しと、あなたの投稿の名前の横に出ます。期限を過ぎると自動で消えます。
      </p>
      <StatusEditor me={me} />
    </section>
  )
}

type PushState = 'loading' | 'unsupported' | 'off' | 'on' | 'denied'

/** この端末でプッシュ通知を受け取るか。購読は端末（ブラウザ）ごと。 */
function PushSettings() {
  const [state, setState] = useState<PushState>('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isPushSupported()) {
      setState('unsupported')
      return
    }
    if (Notification.permission === 'denied') {
      setState('denied')
      return
    }
    void currentPushSubscription().then((sub) => setState(sub ? 'on' : 'off'))
  }, [])

  const toggle = async (on: boolean) => {
    setBusy(true)
    setError(null)
    try {
      if (on) await enablePush()
      else await disablePush()
      setState(on ? 'on' : 'off')
    } catch (e) {
      setError(e instanceof Error ? e.message : '変更に失敗しました。')
      if (Notification.permission === 'denied') setState('denied')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h2 className="text-lg font-bold">プッシュ通知</h2>
      <p className="mt-1 text-xs text-text-muted">
        返信・メンション・リアクション・フォローを、この端末に通知します。端末ごとの設定です。
      </p>
      <div className="mt-4 text-sm">
        {state === 'loading' && (
          <span className="text-text-muted">確認しています…</span>
        )}
        {state === 'unsupported' && (
          <p className="text-text-muted">
            このブラウザはプッシュ通知に対応していません。iPhone / iPad
            では、Safari
            の共有メニューから「ホーム画面に追加」して開くと使えます。
          </p>
        )}
        {state === 'denied' && (
          <p className="text-text-muted">
            通知がブロックされています。ブラウザのサイト設定から、このサイトの通知を許可してください。
          </p>
        )}
        {(state === 'on' || state === 'off') && (
          <Button
            variant={state === 'on' ? 'ghost' : 'primary'}
            size="sm"
            disabled={busy}
            onClick={() => void toggle(state === 'off')}
          >
            {busy
              ? '変更中…'
              : state === 'on'
                ? 'この端末の通知をやめる'
                : 'この端末で通知を受け取る'}
          </Button>
        )}
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      </div>
    </section>
  )
}

/**
 * ミュート中のユーザーとミュートする語。ミュートした人・語を含む投稿は
 * チャンネル・タグ・検索の一覧から見えなくなる（相手には何も起きない）。
 */
function MuteSettings() {
  const me = useMe()
  const queryClient = useQueryClient()
  const mutes = useQuery(mutesQuery)
  const [words, setWords] = useState((me?.mutedWords ?? []).join('\n'))

  const save = useMutation({
    mutationFn: () =>
      updateMutedWords({
        data: { words: words.split('\n').filter((w) => w.trim() !== '') },
      }),
    onSuccess: (result) => {
      if (!result.ok) return
      queryClient.setQueryData(meQuery.queryKey, result.me)
      setWords(result.me.mutedWords.join('\n'))
    },
  })
  const failure = save.data && !save.data.ok ? save.data : null

  return (
    <section>
      <h2 className="text-lg font-bold">ミュート</h2>
      <p className="mt-1 text-xs text-text-muted">
        ミュートした人・語を含む投稿は、チャンネル・タグ・検索の一覧に出なくなります。ミュートした人からの通知も止まります。相手には知らされません。
      </p>

      <h3 className="mt-5 text-sm font-bold">ミュート中のユーザー</h3>
      {mutes.data && mutes.data.length === 0 && (
        <p className="mt-2 text-sm text-text-muted">
          いません。部屋の見出しか投稿のメニューからミュートできます。
        </p>
      )}
      <ul className="mt-2 divide-y divide-border">
        {mutes.data?.map(({ user }) => (
          <MuteRow key={user.handle} user={user} />
        ))}
      </ul>

      <form
        className="mt-6"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <Field
          label="ミュートする語（1行に1つ）"
          error={failure?.errors.words}
          hint="大文字・小文字は区別しません。50 語まで。"
        >
          <textarea
            value={words}
            onChange={(e) => setWords(e.target.value)}
            rows={4}
            placeholder={'例:\nネタバレ\n#某ドラマ'}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm"
          />
        </Field>
        <div className="mt-3 flex items-center gap-3">
          <Button type="submit" size="sm" disabled={save.isPending}>
            {save.isPending ? '保存中…' : '保存'}
          </Button>
          {save.data?.ok && (
            <span className="text-xs text-accent">保存しました</span>
          )}
          {failure && Object.keys(failure.errors).length === 0 && (
            <span className="text-xs text-danger">{failure.message}</span>
          )}
        </div>
      </form>
    </section>
  )
}

function MuteRow({
  user,
}: {
  user: { handle: string; displayName: string; avatarUrl?: string | null }
}) {
  const unmute = useMuteToggle(user.handle)

  return (
    <li className="flex items-center gap-3 py-2.5 text-sm">
      <Avatar user={user} />
      <span className="font-bold">{user.displayName}</span>
      <span className="text-xs text-text-muted">@{user.handle}</span>
      <Button
        variant="ghost"
        size="sm"
        className="ml-auto"
        disabled={unmute.isPending}
        onClick={() => unmute.mutate(false)}
      >
        ミュートを解除
      </Button>
    </li>
  )
}

function ProfileForm({ me }: { me: Me }) {
  const queryClient = useQueryClient()
  const [displayName, setDisplayName] = useState(me.displayName)
  const [bio, setBio] = useState(me.bio ?? '')
  const [companyName, setCompanyName] = useState(me.companyName ?? '')

  const save = useMutation({
    mutationFn: () =>
      updateMe({
        data: {
          handle: me.handle,
          displayName,
          bio: bio || null,
          companyName: companyName || null,
        },
      }),
    onSuccess: (result) => {
      if (!result.ok) return
      queryClient.setQueryData(meQuery.queryKey, result.me)
      if (result.me.handle) {
        void queryClient.invalidateQueries({
          queryKey: ['room', result.me.handle],
        })
      }
    },
  })
  const failure = save.data && !save.data.ok ? save.data : null

  return (
    <section>
      <h2 className="text-lg font-bold">プロフィール</h2>
      <p className="mt-1 text-xs text-text-muted">
        handle: <span className="font-mono">@{me.handle}</span>
        （変更できません）
      </p>

      <form
        className="mt-6 space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <Field label="表示名" error={failure?.errors.displayName}>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            maxLength={50}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
          />
        </Field>

        <Field label="自己紹介" error={failure?.errors.bio}>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={300}
            rows={3}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
          />
        </Field>

        <Field
          label="所属（任意）"
          error={failure?.errors.companyName}
          hint="自己申告です。同じ会社名を書いた人どうしが /org/会社名 の一覧に並びます（確認はしません）。"
        >
          <input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            maxLength={100}
            placeholder="例: 株式会社サンプル"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
          />
        </Field>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? '保存中…' : '保存'}
          </Button>
          {save.data?.ok && (
            <span className="text-xs text-accent">保存しました</span>
          )}
          {failure && Object.keys(failure.errors).length === 0 && (
            <span className="text-xs text-danger">{failure.message}</span>
          )}
        </div>
      </form>
    </section>
  )
}

/**
 * ブロック中のユーザーと解除ボタン。ブロックそのものは部屋の画面か
 * 投稿のメニューから行う。
 */
function BlockList() {
  const blocks = useQuery(blocksQuery)

  return (
    <section>
      <h2 className="text-lg font-bold">ブロック中のユーザー</h2>
      <p className="mt-1 text-xs text-text-muted">
        ブロックした人はあなたの投稿に返信・リアクションできず、その人からの通知も届きません。
      </p>
      {blocks.data && blocks.data.length === 0 && (
        <p className="mt-4 text-sm text-text-muted">いません。</p>
      )}
      <ul className="mt-4 divide-y divide-border">
        {blocks.data?.map(({ user }) => (
          <BlockRow key={user.handle} user={user} />
        ))}
      </ul>
    </section>
  )
}

function BlockRow({
  user,
}: {
  user: { handle: string; displayName: string; avatarUrl?: string | null }
}) {
  const unblock = useBlockToggle(user.handle)

  return (
    <li className="flex items-center gap-3 py-2.5 text-sm">
      <Avatar user={user} />
      <span className="font-bold">{user.displayName}</span>
      <span className="text-xs text-text-muted">@{user.handle}</span>
      <Button
        variant="ghost"
        size="sm"
        className="ml-auto"
        disabled={unblock.isPending}
        onClick={() => unblock.mutate(false)}
      >
        ブロックを解除
      </Button>
    </li>
  )
}

/**
 * 退会。投稿の本文・画像、リアクション、フォロー、ブロック、通知を削除する。
 * 他の人のスレッドに付けた返信も消え、自分の親投稿に付いた他人の返信は
 * 「削除されました」の下に残る（仕様は docs/PLAN.md §11）。
 */
function DeleteAccount({ me }: { me: Me }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [confirmText, setConfirmText] = useState('')
  const expected = me.handle ?? 'delete'

  const remove = useMutation({
    mutationFn: () => deleteAccount(),
    onSuccess: async (result) => {
      if (!result.ok) return
      queryClient.clear()
      queryClient.setQueryData(meQuery.queryKey, null)
      await navigate({ to: '/' })
    },
  })

  return (
    <section className="rounded-xl border border-danger/40 p-5">
      <h2 className="text-lg font-bold text-danger">退会する</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-text-muted">
        <li>
          あなたの投稿（本文・画像）、リアクション、フォロー、ブロック、通知をすべて削除します。
        </li>
        <li>他の人のスレッドに付けたあなたの返信は、スレッドから消えます。</li>
        <li>
          他の人があなたの投稿に付けた返信は、「削除されました」の下に残ります（投稿者名は出ません）。
        </li>
        <li>
          handle は解放され、他の人が使えるようになります。元に戻せません。
        </li>
      </ul>

      <label className="mt-4 block text-xs text-text-muted">
        確認のため <span className="font-mono font-bold">{expected}</span>{' '}
        と入力してください
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          className="mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm"
        />
      </label>

      <Button
        variant="danger"
        disabled={confirmText !== expected || remove.isPending}
        onClick={() => remove.mutate()}
        className="mt-3"
      >
        {remove.isPending ? '削除しています…' : '退会してデータを削除する'}
      </Button>
      {remove.data && !remove.data.ok && (
        <p className="mt-2 text-xs text-danger">{remove.data.message}</p>
      )}
    </section>
  )
}

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string
  error?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-text-muted">
        {label}
      </span>
      {children}
      {hint && !error && (
        <span className="mt-1 block text-xs text-text-muted">{hint}</span>
      )}
      {error && <span className="mt-1 block text-xs text-danger">{error}</span>}
    </label>
  )
}
