import dotenv from "dotenv";
import path from "path";

// Cargar variables de entorno desde .env
dotenv.config({ path: path.resolve(__dirname, "../.env") });

export default {
  schema: "./prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL!,
  },
};
