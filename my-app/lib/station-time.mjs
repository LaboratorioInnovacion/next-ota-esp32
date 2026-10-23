export const DISPLAY_TIME_ZONE = "America/Argentina/Buenos_Aires"

export function parseInstant(value) {
  if (value == null || value === "") return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

export function formatArgentina(value) {
  const date = parseInstant(value)
  if (!date) return "Sin lecturas"
  return `${new Intl.DateTimeFormat("es-AR", {
    timeZone: DISPLAY_TIME_ZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "shortOffset",
  }).format(date)} (Argentina)`
}

export function relativeFreshness(value, now = Date.now()) {
  const date = parseInstant(value)
  if (!date) return "Sin lecturas"
  const elapsed = now - date.getTime()
  if (elapsed < 0) return "Fecha futura; verificar reloj"
  if (elapsed < 60_000) return "Hace menos de 1 min"
  if (elapsed < 3_600_000) return `Hace ${Math.floor(elapsed / 60_000)} min`
  if (elapsed < 86_400_000) return `Hace ${Math.floor(elapsed / 3_600_000)} h`
  return `Hace ${Math.floor(elapsed / 86_400_000)} días`
}

export function rollingStart(period, now = Date.now()) {
  const days = period === "week" ? 7 : period === "month" ? 30 : 0
  return new Date(now - days * 86_400_000)
}
