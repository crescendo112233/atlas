CREATE TABLE `footprints` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`city` text NOT NULL,
	`country` text NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`visited_at` text NOT NULL,
	`memory` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_footprints_visited_at` ON `footprints` (`visited_at`);