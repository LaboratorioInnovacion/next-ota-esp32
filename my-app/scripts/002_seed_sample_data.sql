-- Insert sample station
INSERT INTO "Station" ("id", "mac", "name", "status", "createdAt", "updatedAt")
VALUES ('station_1', '0C:B8:15:C4:F8:34', 'ESP32_Meteo', 'online', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("mac") DO NOTHING;

-- Insert sample readings for the last 30 days
DO $$
DECLARE
    station_id TEXT := 'station_1';
    i INTEGER;
    random_temp DOUBLE PRECISION;
    random_humidity DOUBLE PRECISION;
    reading_time TIMESTAMP;
BEGIN
    FOR i IN 0..720 LOOP -- 30 days * 24 hours
        random_temp := 18 + (RANDOM() * 12); -- Temperature between 18-30°C
        random_humidity := 35 + (RANDOM() * 30); -- Humidity between 35-65%
        reading_time := CURRENT_TIMESTAMP - (i || ' hours')::INTERVAL;
        
        INSERT INTO "Reading" ("id", "stationId", "temperature", "humidity", "timestamp")
        VALUES (
            'reading_' || i,
            station_id,
            random_temp,
            random_humidity,
            reading_time
        );
    END LOOP;
END $$;
