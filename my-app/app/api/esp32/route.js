import { measurementPost } from "@/lib/measurement-http.mjs"

export const runtime = "nodejs"

export const POST = measurementPost(async () => {
  // Load persistence only after authorization and measurement validation succeed.
  const { prisma } = await import("@/lib/prisma")
  return prisma
}, "esp32")
