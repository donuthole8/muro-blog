DROP INDEX `archived_posts_slug_unique`;--> statement-breakpoint
ALTER TABLE `archived_posts` ADD `author_id` text REFERENCES users(id) ON DELETE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_archived_posts_author_slug` ON `archived_posts` (`author_id`,`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_archived_posts_legacy_slug` ON `archived_posts` (`slug`) WHERE "archived_posts"."author_id" IS NULL;--> statement-breakpoint
CREATE INDEX `idx_archived_posts_author` ON `archived_posts` (`author_id`,`updated_at`);--> statement-breakpoint
ALTER TABLE `posts` ADD `article_id` integer REFERENCES archived_posts(id) ON DELETE set null;