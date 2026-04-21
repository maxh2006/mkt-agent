-- Lifecycle change: `approved` is no longer a visible operational status.
-- Existing records with status = 'approved' are converted to 'scheduled'.
-- scheduled_at is defaulted to the approval time (approved_at) or now() if missing.
UPDATE "posts"
SET
  "status" = 'scheduled',
  "scheduled_at" = COALESCE("scheduled_at", "approved_at", CURRENT_TIMESTAMP)
WHERE "status" = 'approved';
