import { createHash, timingSafeEqual } from "node:crypto"

export function readingsDeleteAuthorization(header, token) {
  // Match the weather firmware's shared credential, not the diagnostics format.
  const validToken = (value) => typeof value === "string" && value.length > 0 && !/[^\x21-\x7e]/.test(value)
  if (!validToken(token)) return 503
  const match = typeof header === "string" ? /^Bearer ([\x21-\x7e]+)$/i.exec(header) : null
  if (!match || match[0] !== header) return 401
  const digest = (value) => createHash("sha256").update(value).digest()
  return timingSafeEqual(digest(match[1]), digest(token)) ? 200 : 401
}

const json = (body, status) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } })

export function readingsDelete(deleteMany, token = () => process.env.ESP32_AUTH_TOKEN) {
  return async function DELETE(request) {
    const auth = readingsDeleteAuthorization(request.headers.get("authorization"), token())
    if (auth !== 200) return json({ error: auth === 503 ? "Deletion is not configured" : "Unauthorized" }, auth)
    try {
      const result = await deleteMany({})
      return json({
        success: true,
        message: "Todas las lecturas han sido eliminadas",
        count: result.count,
      }, 200)
    } catch {
      return json({ error: "Error al eliminar las lecturas" }, 500)
    }
  }
}
