-- AlterTable
ALTER TABLE "debug_logs" ALTER COLUMN "timestamp" SET DEFAULT CURRENT_TIMESTAMP AT TIME ZONE 'America/Argentina/Buenos_Aires';

-- AlterTable
ALTER TABLE "firmware" ALTER COLUMN "uploadedAt" SET DEFAULT CURRENT_TIMESTAMP AT TIME ZONE 'America/Argentina/Buenos_Aires';

-- AlterTable
ALTER TABLE "measurements" ALTER COLUMN "timestamp" SET DEFAULT CURRENT_TIMESTAMP AT TIME ZONE 'America/Argentina/Buenos_Aires';
