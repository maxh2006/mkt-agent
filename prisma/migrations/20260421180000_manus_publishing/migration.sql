-- Manus publishing architecture: per-platform delivery + new post status values.

-- Add publishing + partial values to PostStatus enum.
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction in Postgres;
-- Prisma migrate deploy runs statements sequentially.
ALTER TYPE "PostStatus" ADD VALUE IF NOT EXISTS 'publishing';
ALTER TYPE "PostStatus" ADD VALUE IF NOT EXISTS 'partial';

-- New DeliveryStatus enum for per-platform delivery state.
DO $$ BEGIN
  CREATE TYPE "DeliveryStatus" AS ENUM ('queued', 'scheduled', 'publishing', 'posted', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Per-platform delivery table
CREATE TABLE IF NOT EXISTS "post_platform_deliveries" (
  "id"                   TEXT PRIMARY KEY,
  "post_id"              TEXT NOT NULL,
  "platform"             "Platform" NOT NULL,
  "status"               "DeliveryStatus" NOT NULL DEFAULT 'queued',
  "scheduled_for"        TIMESTAMP(3),
  "publish_requested_at" TIMESTAMP(3),
  "publish_attempted_at" TIMESTAMP(3),
  "posted_at"            TIMESTAMP(3),
  "external_post_id"     TEXT,
  "retry_count"          INTEGER NOT NULL DEFAULT 0,
  "last_error"           TEXT,
  "worker"               TEXT,
  "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"           TIMESTAMP(3) NOT NULL,

  CONSTRAINT "post_platform_deliveries_post_id_fkey"
    FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "post_platform_deliveries_post_id_platform_key"
  ON "post_platform_deliveries"("post_id", "platform");

CREATE INDEX IF NOT EXISTS "post_platform_deliveries_post_id_idx"
  ON "post_platform_deliveries"("post_id");

CREATE INDEX IF NOT EXISTS "post_platform_deliveries_status_scheduled_for_idx"
  ON "post_platform_deliveries"("status", "scheduled_for");
