CREATE SCHEMA IF NOT EXISTS "public";

CREATE TABLE "Station" (
    "id" TEXT NOT NULL,
    "mac" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'online',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Station_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Reading" (
    "id" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL,
    "humidity" DOUBLE PRECISION NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Reading_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Station_mac_key" ON "Station"("mac");
CREATE INDEX "Station_mac_idx" ON "Station"("mac");
CREATE INDEX "Reading_stationId_timestamp_idx" ON "Reading"("stationId", "timestamp");
CREATE INDEX "Reading_timestamp_idx" ON "Reading"("timestamp");
ALTER TABLE "Reading" ADD CONSTRAINT "Reading_stationId_fkey"
    FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE CASCADE ON UPDATE CASCADE;
