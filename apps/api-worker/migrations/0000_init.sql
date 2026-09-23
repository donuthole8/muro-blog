CREATE TABLE `archived_post_tags` (
	`archived_post_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`archived_post_id`, `tag_id`),
	FOREIGN KEY (`archived_post_id`) REFERENCES `archived_posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_archived_post_tags_tag` ON `archived_post_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `archived_posts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`emoji` text,
	`body_md` text NOT NULL,
	`body_html` text NOT NULL,
	`excerpt` text,
	`status` text NOT NULL,
	`published_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `archived_posts_slug_unique` ON `archived_posts` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_archived_posts_published` ON `archived_posts` (`status`,`published_at`);--> statement-breakpoint
CREATE TABLE `blocks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`blocker_id` text NOT NULL,
	`blocked_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`blocker_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`blocked_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_blocks_pair` ON `blocks` (`blocker_id`,`blocked_id`);--> statement-breakpoint
CREATE INDEX `idx_blocks_blocked` ON `blocks` (`blocked_id`);--> statement-breakpoint
CREATE TABLE `follows` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`follower_id` text NOT NULL,
	`followee_id` text NOT NULL,
	`last_read_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`follower_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`followee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_follows_pair` ON `follows` (`follower_id`,`followee_id`);--> statement-breakpoint
CREATE INDEX `idx_follows_followee` ON `follows` (`followee_id`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`post_id` text,
	`type` text NOT NULL,
	`read_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_notifications_user` ON `notifications` (`user_id`,`id`);--> statement-breakpoint
CREATE INDEX `idx_notifications_unread` ON `notifications` (`user_id`) WHERE "notifications"."read_at" IS NULL;--> statement-breakpoint
CREATE INDEX `idx_notifications_actor` ON `notifications` (`actor_id`);--> statement-breakpoint
CREATE INDEX `idx_notifications_post` ON `notifications` (`post_id`);--> statement-breakpoint
CREATE TABLE `post_tags` (
	`post_id` text NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`post_id`, `tag_id`),
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_post_tags_tag` ON `post_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`author_id` text NOT NULL,
	`parent_id` text,
	`body_markdown` text NOT NULL,
	`body_html` text NOT NULL,
	`image_key` text,
	`reply_count` integer DEFAULT 0 NOT NULL,
	`reaction_count` integer DEFAULT 0 NOT NULL,
	`last_reply_at` integer,
	`edited_at` integer,
	`deleted_at` integer,
	`hidden_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_posts_room` ON `posts` (`author_id`,`id`) WHERE "posts"."parent_id" IS NULL;--> statement-breakpoint
CREATE INDEX `idx_posts_lobby` ON `posts` (`id`) WHERE "posts"."parent_id" IS NULL;--> statement-breakpoint
CREATE INDEX `idx_posts_thread` ON `posts` (`parent_id`,`id`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`post_id` text NOT NULL,
	`user_id` text NOT NULL,
	`emoji` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_reactions_post_user_emoji` ON `reactions` (`post_id`,`user_id`,`emoji`);--> statement-breakpoint
CREATE INDEX `idx_reactions_user` ON `reactions` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_reactions_created` ON `reactions` (`created_at`);--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`reporter_id` text NOT NULL,
	`reason` text NOT NULL,
	`detail` text,
	`resolution` text,
	`resolved_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reporter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_reports_post_reporter` ON `reports` (`post_id`,`reporter_id`);--> statement-breakpoint
CREATE INDEX `idx_reports_open` ON `reports` (`id`) WHERE "reports"."resolved_at" IS NULL;--> statement-breakpoint
CREATE INDEX `idx_reports_reporter` ON `reports` (`reporter_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token_hash` text NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_unique` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_sessions_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `tags_slug_unique` ON `tags` (`slug`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`google_sub` text,
	`handle` text,
	`display_name` text NOT NULL,
	`avatar_url` text,
	`bio` text,
	`company_name` text,
	`company_slug` text,
	`role` text DEFAULT 'user' NOT NULL,
	`suspended_at` integer,
	`deleted_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_google_sub_unique` ON `users` (`google_sub`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_handle_unique` ON `users` (`handle`);--> statement-breakpoint
CREATE INDEX `idx_users_company` ON `users` (`company_slug`);