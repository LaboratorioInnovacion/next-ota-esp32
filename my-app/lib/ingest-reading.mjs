import { validateMeasurement } from "./measurement.mjs"

// The firmware sends no observation time: timestamps denote server receipt, in UTC.
export async function ingestReading(prisma, data, receivedAt = new Date()) {
  const { mac, name, temperature, humidity, lat, lon } = validateMeasurement(data)
  const coordinates = lat === undefined ? {} : { latitude: lat, longitude: lon }
  return prisma.$transaction(async (tx) => {
    const station = await tx.station.upsert({
      where: { mac },
      create: { mac, name: name || `ESP32_${mac.slice(-4)}`, ...coordinates, status: "online", createdAt: receivedAt, updatedAt: receivedAt },
      update: { ...coordinates, status: "online", updatedAt: receivedAt },
    })
    const reading = await tx.reading.create({
      data: { stationId: station.id, temperature, humidity, timestamp: receivedAt },
    })
    return { station, reading }
  })
}
