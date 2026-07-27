CREATE TABLE IF NOT EXISTS `metrics` (
  `key` text PRIMARY KEY NOT NULL,
  `value` text,
  `numeric_value` real,
  `units` text NOT NULL,
  `source_url` text NOT NULL,
  `observed_at` text,
  `verified_at` text,
  `retrieval_status` text NOT NULL,
  `validation_result` text NOT NULL,
  `previous_value` text,
  `note` text,
  `updated_at` integer NOT NULL
);
CREATE TABLE IF NOT EXISTS `readings` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `metric_key` text NOT NULL,
  `numeric_value` real NOT NULL,
  `units` text NOT NULL,
  `observed_at` text NOT NULL,
  `verified_at` text NOT NULL,
  `source_url` text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS `readings_metric_observed_idx` ON `readings` (`metric_key`,`observed_at`);
CREATE TABLE IF NOT EXISTS `quarantined_readings` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `metric_key` text NOT NULL,
  `payload` text NOT NULL,
  `reason` text NOT NULL,
  `received_at` text NOT NULL
);
