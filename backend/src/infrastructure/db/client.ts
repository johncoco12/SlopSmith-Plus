import { PrismaClient } from "@prisma/client";
import { config } from "../../config.js";

// Set the URL before the client is instantiated
process.env.DATABASE_URL = config.databaseUrl;

export const prisma = new PrismaClient({
  log:
    config.logLevel === "debug"
      ? (["query", "info", "warn", "error"] as const)
      : (["warn", "error"] as const),
});
