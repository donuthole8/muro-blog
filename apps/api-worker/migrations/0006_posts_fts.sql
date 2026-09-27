-- 投稿本文の全文検索（FTS5）。日本語は単語で区切れないので trigram（3文字ずつ）で索引する。
-- 本文は posts に持ったまま（外部コンテンツ）、索引だけをトリガーで追従させる。
-- 2文字以下の検索語は trigram で引けないので、その語だけ LIKE で絞る（services/posts.ts）。
CREATE VIRTUAL TABLE `posts_fts` USING fts5(`body_markdown`, content='posts', content_rowid='rowid', tokenize='trigram');
--> statement-breakpoint
CREATE TRIGGER `posts_fts_insert` AFTER INSERT ON `posts` BEGIN
  INSERT INTO `posts_fts`(rowid, `body_markdown`) VALUES (new.rowid, new.`body_markdown`);
END;
--> statement-breakpoint
CREATE TRIGGER `posts_fts_delete` AFTER DELETE ON `posts` BEGIN
  INSERT INTO `posts_fts`(`posts_fts`, rowid, `body_markdown`) VALUES ('delete', old.rowid, old.`body_markdown`);
END;
--> statement-breakpoint
CREATE TRIGGER `posts_fts_update` AFTER UPDATE OF `body_markdown` ON `posts` BEGIN
  INSERT INTO `posts_fts`(`posts_fts`, rowid, `body_markdown`) VALUES ('delete', old.rowid, old.`body_markdown`);
  INSERT INTO `posts_fts`(rowid, `body_markdown`) VALUES (new.rowid, new.`body_markdown`);
END;
--> statement-breakpoint
INSERT INTO `posts_fts`(`posts_fts`) VALUES ('rebuild');
