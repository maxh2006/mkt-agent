-- Step 1: Migrate existing draft events to active before removing the enum value
UPDATE "events" SET "status" = 'active' WHERE "status" = 'draft';

-- Step 2: Remove 'draft' from EventStatus enum
ALTER TYPE "EventStatus" RENAME TO "EventStatus_old";
CREATE TYPE "EventStatus" AS ENUM ('active', 'ended', 'archived');
ALTER TABLE "events" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "events" ALTER COLUMN "status" TYPE "EventStatus" USING ("status"::text::"EventStatus");
ALTER TABLE "events" ALTER COLUMN "status" SET DEFAULT 'active';
DROP TYPE "EventStatus_old";

-- Step 3: Add new campaign brief fields to events
ALTER TABLE "events" ADD COLUMN "target_audience" TEXT;
ALTER TABLE "events" ADD COLUMN "cta" TEXT;
ALTER TABLE "events" ADD COLUMN "tone" TEXT;
ALTER TABLE "events" ADD COLUMN "platform_scope" JSONB;
ALTER TABLE "events" ADD COLUMN "notes_for_ai" TEXT;
ALTER TABLE "events" ADD COLUMN "posting_instance_json" JSONB;
ALTER TABLE "events" ADD COLUMN "auto_generate_posts" BOOLEAN NOT NULL DEFAULT false;

-- Step 4: Add source_instance_key to posts
ALTER TABLE "posts" ADD COLUMN "source_instance_key" TEXT;
