-- AlterTable
ALTER TABLE "brands" ADD COLUMN     "accent_color" TEXT,
ADD COLUMN     "design_settings_json" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "integration_settings_json" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "sample_captions_json" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "secondary_color" TEXT,
ADD COLUMN     "voice_settings_json" JSONB NOT NULL DEFAULT '{}';
