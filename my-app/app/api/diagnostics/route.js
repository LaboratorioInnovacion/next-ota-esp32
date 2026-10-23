import { prisma } from "@/lib/prisma"
import { diagnosticHandlers } from "@/lib/diagnostics-http.mjs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
const handlers = diagnosticHandlers(prisma)

export async function POST(request) {
  return handlers.POST(request)
}

export async function GET(request) {
  return handlers.GET(request)
}
