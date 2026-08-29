CREATE TABLE `footprint_photos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`footprint_id` integer NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`footprint_id`) REFERENCES `footprints`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_footprint_photos_footprint_id` ON `footprint_photos` (`footprint_id`);