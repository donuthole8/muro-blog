CREATE TABLE `email_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token_hash` text NOT NULL,
	`user_id` text NOT NULL,
	`purpose` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_tokens_token_hash_unique` ON `email_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_email_tokens_user` ON `email_tokens` (`user_id`,`purpose`);--> statement-breakpoint
CREATE TABLE `mutes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`muter_id` text NOT NULL,
	`muted_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`muter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`muted_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_mutes_pair` ON `mutes` (`muter_id`,`muted_id`);--> statement-breakpoint
CREATE INDEX `idx_mutes_muted` ON `mutes` (`muted_id`);--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `idx_push_subscriptions_user` ON `push_subscriptions` (`user_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `email_verified_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `avatar_key` text;--> statement-breakpoint
ALTER TABLE `users` ADD `status_emoji` text;--> statement-breakpoint
ALTER TABLE `users` ADD `status_text` text;--> statement-breakpoint
ALTER TABLE `users` ADD `status_expires_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `muted_words` text;--> statement-breakpoint
CREATE INDEX `idx_posts_author_created` ON `posts` (`author_id`,`created_at`);--> statement-breakpoint
-- メール確認を入れる前に登録した人は、確認済みとして扱う（締め出さない）
UPDATE `users` SET `email_verified_at` = `created_at` WHERE `email` IS NOT NULL;
