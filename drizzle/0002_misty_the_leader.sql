ALTER TABLE `tickets` ADD `age_minutes` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_tickets_sla` ON `tickets` (`ticket_status`,`triage_priority`,`age_minutes`);