#!/usr/bin/env bash
# Symfony 時代の Postgres から、タグと旧ブログの記事（アーカイブ）を D1 用の SQL に書き出す。
# times の投稿・ユーザーは移さない（本番にはまだデータがないため）。
#
#   DATABASE_URL=postgresql://blog:blog@127.0.0.1:5433/blog ./scripts/export-archive.sh > archive.sql
#   pnpm exec wrangler d1 execute blog --remote --file archive.sql   # ローカルなら --local
#
# 日時の列は timezone なしで保存されている（UTC）ので、そのまま unix 秒にする。
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL を指定してください}"
# Doctrine 用の ?serverVersion=16&charset=utf8 は psql が解釈できないので落とす
url="${DATABASE_URL%%\?*}"

psql "$url" -At -v ON_ERROR_STOP=1 <<'SQL'
SELECT format('INSERT OR IGNORE INTO tags (id, name, slug) VALUES (%s, %L, %L);', id, name, slug)
FROM tags ORDER BY id;

SELECT format(
  'INSERT OR REPLACE INTO archived_posts (id, slug, title, emoji, body_md, body_html, excerpt, status, published_at, created_at, updated_at) VALUES (%s, %L, %L, %L, %L, %L, %L, %L, %s, %s, %s);',
  id, slug, title, emoji, body_md, body_html, excerpt, status,
  COALESCE(extract(epoch FROM published_at)::bigint::text, 'NULL'),
  extract(epoch FROM created_at)::bigint,
  extract(epoch FROM updated_at)::bigint
)
FROM archived_posts ORDER BY id;

SELECT format('INSERT OR IGNORE INTO archived_post_tags (archived_post_id, tag_id) VALUES (%s, %s);', archived_post_id, tag_id)
FROM archived_post_tags ORDER BY archived_post_id, tag_id;
SQL
