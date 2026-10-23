import { prisma } from "@/lib/prisma"
import { measurementPost } from "@/lib/measurement-http.mjs"

export const POST = measurementPost(prisma, "esp32")
