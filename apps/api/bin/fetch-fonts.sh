#!/usr/bin/env bash
# OGP 画像（OgImageRenderer）用の日本語フォントを取得する。
#
# Noto Sans JP は SIL Open Font License 1.1 で配布されている（再配布可）。
# 9MB ほどあるのでリポジトリには入れず、Docker のビルド時とローカルの初回に取得する。
set -euo pipefail

dir="$(cd "$(dirname "$0")/.." && pwd)/resources/fonts"
base="https://github.com/notofonts/noto-cjk/raw/main/Sans/SubsetOTF/JP"
mkdir -p "$dir"

for weight in Regular Bold; do
  file="$dir/NotoSansJP-$weight.otf"
  if [ ! -s "$file" ]; then
    curl -fsSL -o "$file" "$base/NotoSansJP-$weight.otf"
  fi
done

echo "fonts: $dir"
