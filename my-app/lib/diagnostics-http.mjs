import { createHash, timingSafeEqual } from "node:crypto"
import { diagnosticQuery, ingestDiagnostic, validateDiagnostic } from "./diagnostics.mjs"

export function diagnosticAuthorization(header, token) {
  // Dedicated URL-safe high-entropy credential, never a provisioning password.
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{32,256}$/.test(token)) return 503
  const supplied = typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7) : ""
  const digest = (value) => createHash("sha256").update(value).digest()
  return timingSafeEqual(digest(supplied), digest(token)) ? 200 : 401
}

const json = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } })

async function boundedBody(request) {
  if (!request.body) return null
  const reader = request.body.getReader()
  const chunks = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 2048) { await reader.cancel(); throw new Error("body_limit") }
      chunks.push(value)
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"))
  } finally { reader.releaseLock() }
}

export function diagnosticHandlers(prisma, token = () => process.env.ESP32_DIAGNOSTICS_TOKEN) {
  return {
    async POST(request) {
      const auth = diagnosticAuthorization(request.headers.get("authorization"), token())
      if (auth !== 200) return json({ error: auth === 503 ? "Diagnóstico no configurado" : "No autorizado" }, auth)
      let data
      try { data = validateDiagnostic(await boundedBody(request)) } catch { return json({ error: "Diagnóstico inválido o demasiado grande" }, 400) }
      if (!data) return json({ error: "Diagnóstico inválido" }, 400)
      try {
        return json({ success: true, ...await ingestDiagnostic(prisma, data) })
      } catch { return json({ error: "No se pudo guardar el diagnóstico" }, 503) }
    },
    async GET(request) {
      const query = diagnosticQuery(new URL(request.url).searchParams)
      if (!query) return json({ error: "Se requiere mac válido y limit entre 1 y 100" }, 400)
      try {
        const data = await prisma.diagnostic.findMany({
          where: { station: { mac: query.mac } }, take: query.limit,
          orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
          select: { receivedAt: true, sensorStatus: true, errorCode: true, version: true, uptimeMs: true },
        })
        return json({ success: true, count: data.length, data })
      } catch { return json({ error: "No se pudo consultar el diagnóstico" }, 503) }
    },
  }
}
