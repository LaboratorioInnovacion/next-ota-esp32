import { weatherAuthorization as readingsDeleteAuthorization } from "./weather-authorization.mjs"

export { readingsDeleteAuthorization }

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
