-- Add latitude and longitude fields to Station table
ALTER TABLE "Station" ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION;
ALTER TABLE "Station" ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;

-- Create index for location queries
CREATE INDEX IF NOT EXISTS "Station_location_idx" ON "Station"("latitude", "longitude");
