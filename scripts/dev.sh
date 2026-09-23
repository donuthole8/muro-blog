#!/usr/bin/env bash
#
# 開発環境をまとめて起動する。
#
#   API Worker (:8000, D1 はローカルの SQLite) → フロントエンド (:3100)
#
# API を起動し忘れるとフロントは "Network connection lost" で 500 になるため、
# 常にこのスクリプト経由で起動する。Ctrl+C で全部まとめて止まる。

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_PORT=8000
WEB_PORT=3100

# nodebrew の古い pnpm を避けて nvm 側の corepack を使う（README 参照）
COREPACK="${COREPACK_BIN:-$HOME/.nvm/versions/node/v22.23.2/bin/corepack}"
if [ ! -x "$COREPACK" ]; then
  COREPACK="$(command -v corepack)"
fi
PNPM="$COREPACK pnpm"

pids=()

cleanup() {
  echo ""
  echo "終了処理中…"
  for pid in "${pids[@]:-}"; do
    [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  echo "停止しました"
}
trap cleanup EXIT INT TERM

# 前回の残骸を片付ける。放置すると vite がポートをずらして起動し、
# 古いサーバーを見てしまう事故が起きる。
for port in "$API_PORT" "$WEB_PORT" $((WEB_PORT + 1)) $((WEB_PORT + 2)); do
  pid="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null | head -1 || true)"
  if [ -n "$pid" ]; then
    echo "ポート $port の既存プロセス (PID $pid) を停止します"
    kill "$pid" 2>/dev/null || true
  fi
done
sleep 1

echo "[1/2] API（Cloudflare Workers + D1）を起動…"
# マイグレーションは適用済みなら何もしない
(cd "$ROOT/apps/api-worker" && $PNPM exec wrangler d1 migrations apply blog --local >/dev/null)
(cd "$ROOT/apps/api-worker" && $PNPM exec wrangler dev --port "$API_PORT") >/dev/null 2>&1 &
pids+=("$!")
for _ in $(seq 1 60); do
  curl -sf -o /dev/null "http://127.0.0.1:$API_PORT/api/lobby" && break
  sleep 1
done
echo "      → http://127.0.0.1:$API_PORT"

echo "[2/2] フロントエンドを起動…"
(cd "$ROOT/apps/web" && $PNPM dev) &
pids+=("$!")

echo ""
echo "──────────────────────────────────────────"
echo "  times     http://localhost:$WEB_PORT"
echo "  ログイン  http://localhost:$WEB_PORT/dev-login （Google 未設定時の開発用）"
echo "  API       http://127.0.0.1:$API_PORT/api/lobby"
echo "──────────────────────────────────────────"
echo "  Ctrl+C で全て停止します"
echo ""

wait
