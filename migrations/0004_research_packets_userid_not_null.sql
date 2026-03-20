-- Make research_packets.user_id NOT NULL
-- Backfill any remaining NULL user_ids from contacts table first
UPDATE "research_packets" rp
SET "user_id" = c."user_id"
FROM "contacts" c
WHERE rp."contact_id" = c."id" AND rp."user_id" IS NULL;

-- Set NOT NULL constraint (safe after backfill)
ALTER TABLE "research_packets" ALTER COLUMN "user_id" SET NOT NULL;
