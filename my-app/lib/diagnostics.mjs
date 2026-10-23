const macPattern = /^(?:[0-9A-F]{2}:){5}[0-9A-F]{2}$/i
const printable = (value, max) => typeof value === "string" && value.length > 0 && value.length <= max && /^[\x20-\x7e]+$/.test(value)

export function validateDiagnostic(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null
  const allowed = ["mac", "name", "version", "bootId", "uptimeMs", "sensorStatus", "errorCode"]
  if (Object.keys(data).some((key) => !allowed.includes(key))) return null
  if (typeof data.mac !== "string" || !macPattern.test(data.mac) ||
      !printable(data.name, 64) || !printable(data.version, 64) ||
      typeof data.bootId !== "string" || !/^[a-f0-9]{16}$/.test(data.bootId) ||
      !Number.isSafeInteger(data.uptimeMs) || data.uptimeMs < 0 ||
      !["ok", "error", "unknown"].includes(data.sensorStatus) ||
      data.errorCode !== (data.sensorStatus === "error" ? "DHT_INVALID_SAMPLE" : "NONE")) return null
  return { ...data, mac: data.mac.toUpperCase() }
}

export function diagnosticQuery(params) {
  const mac = params.get("mac")
  const limit = params.get("limit") ?? "20"
  if (!mac || !macPattern.test(mac) || !/^[1-9]\d{0,2}$/.test(limit) || Number(limit) > 100) return null
  return { mac: mac.toUpperCase(), limit: Number(limit) }
}

// No device wall clock or inferred observation timestamp: only reading receipt.
export function stationHealth(station, now = Date.now()) {
  const diagnostic = station.lastSeenAt != null
  const lastSeenAt = station.lastSeenAt ?? station.lastUpdate ?? null
  const seen = lastSeenAt == null ? NaN : new Date(lastSeenAt).getTime()
  const fresh = Number.isFinite(seen) && seen <= now && now - seen <= (diagnostic ? 180000 : 900000)
  const sensorStatus = diagnostic && ["ok", "error", "unknown"].includes(station.sensorStatus) ? station.sensorStatus : "unknown"
  const status = !Number.isFinite(seen) ? "unknown" : fresh ? "online" : "offline"
  const reason = status === "unknown" ? "Sin señales recibidas" : !fresh ? "Sin conexión o señal atrasada" :
    sensorStatus === "error" ? "Conectado: sensor con error" : sensorStatus === "ok" ? "Conectado: sensor operativo" : "Conectado: sensor sin diagnóstico"
  return { status, sensorStatus, lastSeenAt, reason }
}

export async function ingestDiagnostic(prisma, data, clock = () => new Date()) {
  return prisma.$transaction(async (tx) => {
    // Serialize first creation and updates for one MAC across app instances.
    // Cast void to text: Prisma cannot deserialize PostgreSQL's void result.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${data.mac}, 0))::text`
    const previous = await tx.station.findUnique({ where: { mac: data.mac } })
    if (previous?.diagnosticBootId === data.bootId && previous.diagnosticUptimeMs >= data.uptimeMs) {
      return { accepted: false }
    }
    // Take authoritative receipt time only after acquiring the lock.
    const receivedAt = clock()
    const metadata = { lastSeenAt: receivedAt, sensorStatus: data.sensorStatus,
      sensorErrorCode: data.errorCode, firmwareVersion: data.version,
      diagnosticBootId: data.bootId, diagnosticUptimeMs: data.uptimeMs }
    const station = await tx.station.upsert({
      where: { mac: data.mac },
      create: { mac: data.mac, name: data.name, ...metadata },
      update: metadata,
    })
    await tx.diagnostic.create({ data: { stationId: station.id, bootId: data.bootId,
      uptimeMs: data.uptimeMs, sensorStatus: data.sensorStatus, errorCode: data.errorCode,
      version: data.version, receivedAt } })
    // Retain at most 100 events per station; no historical queue or delivery guarantee.
    const retained = await tx.diagnostic.findMany({ where: { stationId: station.id },
      orderBy: [{ receivedAt: "desc" }, { id: "desc" }], take: 100, select: { id: true } })
    await tx.diagnostic.deleteMany({ where: { stationId: station.id, id: { notIn: retained.map((event) => event.id) } } })
    return { accepted: true }
  }, { isolationLevel: "ReadCommitted" })
}
