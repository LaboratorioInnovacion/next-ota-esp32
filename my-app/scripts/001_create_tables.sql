-- Create stations table
CREATE TABLE IF NOT EXISTS "Station" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mac" TEXT NOT NULL UNIQUE,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'online',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- Create readings table
CREATE TABLE IF NOT EXISTS "Reading" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stationId" TEXT NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL,
    "humidity" DOUBLE PRECISION NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Reading_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "Station_mac_idx" ON "Station"("mac");
CREATE INDEX IF NOT EXISTS "Reading_stationId_timestamp_idx" ON "Reading"("stationId", "timestamp");
CREATE INDEX IF NOT EXISTS "Reading_timestamp_idx" ON "Reading"("timestamp");
