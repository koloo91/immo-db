CREATE TABLE `brokers` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`name` text,
	`company` text,
	`email` text,
	`phone` text,
	`website` text,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `checklist_items` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'missing' NOT NULL,
	`notes` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `communications` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`channel` text NOT NULL,
	`direction` text DEFAULT 'outbound' NOT NULL,
	`summary` text NOT NULL,
	`details` text,
	`next_follow_up_date` text,
	`created_at` integer NOT NULL,
	`thread_id` text,
	`subject` text,
	`from_address` text,
	`to_address` text,
	`occurred_at` integer,
	`body_text` text,
	`state` text DEFAULT 'logged' NOT NULL,
	`ai_insights_json` text,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`thread_id`) REFERENCES `email_threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `document_chats` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`role` text NOT NULL,
	`message` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `document_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`property_id` text NOT NULL,
	`page_number` integer NOT NULL,
	`text` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`file_name` text NOT NULL,
	`file_path` text NOT NULL,
	`file_size` integer NOT NULL,
	`doc_type` text DEFAULT 'sonstiges' NOT NULL,
	`ai_summary` text,
	`ai_extracted_data_json` text,
	`ai_risk_assessment_json` text,
	`created_at` integer NOT NULL,
	`communication_id` text,
	`file_hash` text,
	`mime_type` text,
	`analysis_status` text DEFAULT 'pending' NOT NULL,
	`analysis_error` text,
	`analyzed_at` integer,
	`page_count` integer,
	`has_text_layer` integer,
	`text_status` text DEFAULT 'pending' NOT NULL,
	`text_extracted_at` integer,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`communication_id`) REFERENCES `communications`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `email_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`subject` text NOT NULL,
	`subject_key` text NOT NULL,
	`participants_json` text,
	`last_message_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `listing_status` (
	`property_id` text PRIMARY KEY NOT NULL,
	`portal` text,
	`state` text DEFAULT 'unknown' NOT NULL,
	`last_checked_at` integer,
	`last_ok_at` integer,
	`last_message` text,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`suspect_since` integer,
	`last_seen_title` text,
	`last_seen_price` real,
	`first_seen_at` integer,
	`pending_price` real,
	`pending_price_seen_at` integer,
	`alert_ack_at` integer,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `parcels` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`flstkennz` text,
	`gemarkung_name` text,
	`gemarkung_schluessel` text,
	`flur` integer,
	`zaehler` integer,
	`nenner` integer,
	`official_area` real,
	`boris_bodenrichtwert` real,
	`boris_stichtag` text,
	`boris_entwicklungszustand` text,
	`boris_nutzung` text,
	`price_history_json` text,
	`geojson_geometry` text,
	`last_fetched_at` integer,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `price_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`observed_at` integer NOT NULL,
	`kind` text NOT NULL,
	`price` real,
	`previous_price` real,
	`price_per_sqm` real,
	`source` text DEFAULT 'auto' NOT NULL,
	`note` text,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `properties` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`address` text,
	`asking_price` real,
	`area_sqm` real,
	`price_per_sqm` real,
	`ad_url` text,
	`notes` text,
	`building_law` text,
	`grz` real,
	`gfz` real,
	`development_status` text,
	`purchase_costs_percent` real DEFAULT 10.5,
	`latitude` real,
	`longitude` real,
	`primary_image_url` text,
	`images_json` text,
	`ancillary_costs_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `property_analyses` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`model` text,
	`is_simulated` integer DEFAULT 0 NOT NULL,
	`score_overall` integer,
	`verdict` text,
	`summary` text,
	`risks_json` text,
	`opportunities_json` text,
	`open_questions_json` text,
	`price_assessment_json` text,
	`input_snapshot_json` text,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE cascade
);
