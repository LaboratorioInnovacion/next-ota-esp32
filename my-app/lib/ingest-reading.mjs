// The firmware sends no observation time: timestamps denote server receipt, in UTC.
export async function ingestReading(prisma, { mac, name, temperature, humidity }, receivedAt = new Date()) {
  return prisma.$transaction(async (tx) => {
    const station = await tx.station.upsert({
      where: { mac },
      create: { mac, name: name || `ESP32_${mac.slice(-4)}`, status: "online", createdAt: receivedAt, updatedAt: receivedAt },
      update: { status: "online", updatedAt: receivedAt },
    })
    const reading = await tx.reading.create({
      data: { stationId: station.id, temperature, humidity, timestamp: receivedAt },
    })
    return { station, reading }
  })
}
