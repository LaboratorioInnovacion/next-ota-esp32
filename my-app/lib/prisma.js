import { PrismaClient } from "@prisma/client";
import config from "../prisma/prisma.config";

const globalForPrisma = globalThis;

export const prisma = globalForPrisma.prisma ?? new PrismaClient(config);

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
