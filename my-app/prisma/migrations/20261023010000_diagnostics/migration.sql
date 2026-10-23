-- Additive only; timestamps remain UTC receipt instants in TIMESTAMP(3).
ALTER TABLE "Station"
  ADD COLUMN "diagnosticBootId" TEXT,
  ADD COLUMN "diagnosticUptimeMs" DOUBLE PRECISION,
  ADD COLUMN "firmwareVersion" TEXT,
  ADD COLUMN "lastSeenAt" TIMESTAMP(3),
  ADD COLUMN "sensorErrorCode" TEXT,
  ADD COLUMN "sensorStatus" TEXT;

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
CREATE INDEX "Diagnostic_stationId_receivedAt_idx" ON "Diagnostic"("stationId", "receivedAt");
CREATE UNIQUE INDEX "Diagnostic_stationId_bootId_uptimeMs_key" ON "Diagnostic"("stationId", "bootId", "uptimeMs");
ALTER TABLE "Diagnostic" ADD CONSTRAINT "Diagnostic_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE CASCADE ON UPDATE CASCADE;
