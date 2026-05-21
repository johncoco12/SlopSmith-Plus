import fp from "fastify-plugin";
import { config } from "../../config.js";

export const versionRoutes = fp(async function versionRoutes(fastify) {
  fastify.get("/api/version", async () => ({
    version: config.version,
    source_url: config.appSourceUrl,
    license_url: config.appLicenseUrl,
  }));
});
