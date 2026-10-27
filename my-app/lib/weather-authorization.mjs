import { createHash, timingSafeEqual } from "node:crypto"

export function weatherAuthorization(header, token) {
  // Match the weather firmware's shared credential, not the diagnostics format.
  const validToken = (value) => typeof value === "string" && value.length > 0 && !/[^\x21-\x7e]/.test(value)
  if (!validToken(token)) return 503
  const match = typeof header === "string" ? /^Bearer ([\x21-\x7e]+)$/i.exec(header) : null
  if (!match || match[0] !== header) return 401
  const digest = (value) => createHash("sha256").update(value).digest()
  return timingSafeEqual(digest(match[1]), digest(token)) ? 200 : 401
}
