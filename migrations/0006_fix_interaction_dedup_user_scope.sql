-- Migration: Fix interaction dedup unique index to be user-scoped.
--
-- The existing global unique index on (channel, source_id) would cause a DB
-- constraint violation if two users sync the same email thread or meeting.
-- Replace with a user-scoped partial unique index on (user_id, channel, source_id).

DROP INDEX IF EXISTS "interactions_channel_source_id_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "interactions_user_channel_source_id_unique" ON "interactions" USING btree ("user_id","channel","source_id") WHERE "interactions"."source_id" IS NOT NULL;
