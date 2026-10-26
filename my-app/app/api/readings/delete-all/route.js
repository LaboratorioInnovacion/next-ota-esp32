import { readingsDelete } from "@/lib/readings-delete-http.mjs"

export const runtime = "nodejs"

export const DELETE = readingsDelete(async (args) => {
  // Load persistence only after authorization succeeds.
  const { prisma } = await import("@/lib/prisma")
  return prisma.reading.deleteMany(args)
})
