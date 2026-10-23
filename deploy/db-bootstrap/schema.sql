-- First initialization of a NEW empty cluster only; never a runtime migration.
CREATE TABLE "Station" (
    "id" TEXT NOT NULL,
    "mac" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'online',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "diagnosticBootId" TEXT,
    "diagnosticUptimeMs" DOUBLE PRECISION,
    "firmwareVersion" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "sensorErrorCode" TEXT,
    "sensorStatus" TEXT,
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
CREATE TABLE "Diagnostic" (
    "id" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "bootId" TEXT NOT NULL,
    "uptimeMs" DOUBLE PRECISION NOT NULL,
    "sensorStatus" TEXT NOT NULL,
    "errorCode" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Diagnostic_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Station_mac_key" ON "Station"("mac");
CREATE INDEX "Station_mac_idx" ON "Station"("mac");
CREATE INDEX "Reading_stationId_timestamp_idx" ON "Reading"("stationId", "timestamp");
CREATE INDEX "Reading_timestamp_idx" ON "Reading"("timestamp");
CREATE INDEX "Diagnostic_stationId_receivedAt_idx" ON "Diagnostic"("stationId", "receivedAt");
CREATE UNIQUE INDEX "Diagnostic_stationId_bootId_uptimeMs_key" ON "Diagnostic"("stationId", "bootId", "uptimeMs");
ALTER TABLE "Reading" ADD CONSTRAINT "Reading_stationId_fkey"
    FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Diagnostic" ADD CONSTRAINT "Diagnostic_stationId_fkey"
    FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE CASCADE ON UPDATE CASCADE;
