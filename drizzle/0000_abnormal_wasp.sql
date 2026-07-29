CREATE TABLE `tickets` (
	`id` integer PRIMARY KEY NOT NULL,
	`customer_name` text NOT NULL,
	`customer_email` text NOT NULL,
	`customer_age` integer,
	`customer_gender` text,
	`product_purchased` text NOT NULL,
	`date_of_purchase` text,
	`ticket_type` text NOT NULL,
	`ticket_subject` text NOT NULL,
	`ticket_description` text NOT NULL,
	`ticket_status` text NOT NULL,
	`resolution` text,
	`source_priority` text NOT NULL,
	`ticket_channel` text NOT NULL,
	`first_response_at` integer,
	`resolved_at` integer,
	`customer_satisfaction_rating` integer,
	`assignee` text,
	`escalated_at` integer,
	`created_at` integer DEFAULT 0 NOT NULL,
	`at_risk_at` integer DEFAULT 0 NOT NULL,
	`breach_at` integer DEFAULT 0 NOT NULL,
	`triage_priority` text NOT NULL,
	`triage_score` integer NOT NULL,
	`triage_category` text NOT NULL,
	`triage_reasons` text DEFAULT '[]' NOT NULL,
	`resolution_minutes` integer,
	CONSTRAINT "csat_range" CHECK("tickets"."customer_satisfaction_rating" IS NULL OR "tickets"."customer_satisfaction_rating" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE INDEX `idx_tickets_status` ON `tickets` (`ticket_status`);--> statement-breakpoint
CREATE INDEX `idx_tickets_triage_pri` ON `tickets` (`triage_priority`);--> statement-breakpoint
CREATE INDEX `idx_tickets_channel` ON `tickets` (`ticket_channel`);--> statement-breakpoint
CREATE INDEX `idx_tickets_product` ON `tickets` (`product_purchased`);--> statement-breakpoint
CREATE INDEX `idx_tickets_assignee` ON `tickets` (`assignee`);--> statement-breakpoint
CREATE INDEX `idx_tickets_type` ON `tickets` (`ticket_type`);--> statement-breakpoint
CREATE INDEX `idx_tickets_queue_sort` ON `tickets` (`ticket_status`,"triage_score" desc,"id" desc);--> statement-breakpoint
CREATE INDEX `idx_tickets_breach` ON `tickets` (`ticket_status`,`breach_at`);--> statement-breakpoint
CREATE INDEX `idx_tickets_at_risk` ON `tickets` (`ticket_status`,`at_risk_at`);--> statement-breakpoint
CREATE INDEX `idx_tickets_created` ON `tickets` (`ticket_status`,`created_at`);