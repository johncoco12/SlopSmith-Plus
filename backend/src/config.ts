import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { z } from "zod";

const EnvSchema = z.object({
  DLC_DIR: z.string().optional(),
  CONFIG_DIR: z.string().optional(),
  RSCLI_PATH: z.string().optional(),
  VGMSTREAM_CLI: z.string().optional(),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
  LOG_PRETTY: z.string().transform((v) => v === "true" || v === "1").default("false"),
  SLOPSMITH_DEMO_MODE: z.string().transform((v) => v === "1" || v === "true").default(""),
  SLOPSMITH_PLUGINS_DIR: z.string().optional(),
  ELECTRON_MODE: z.string().transform((v) => v === "1" || v === "true").default(""),
  APP_SOURCE_URL: z
    .string()
    .url()
    .default("https://github.com/byrongamatos/slopsmith"),
  APP_LICENSE_URL: z.string().url().optional(),
  DATABASE_URL: z.string().optional(),

  // SlopAudio Connect
  SAC_SERVER_NAME: z.string().default("SlopSmith"),
  SAC_HTTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),

  MINIO_ENDPOINT: z.string().optional(),
  MINIO_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  MINIO_ACCESS_KEY: z.string().optional(),
  MINIO_SECRET_KEY: z.string().optional(),
  MINIO_BUCKET: z.string().default("slopsmith"),
  MINIO_USE_SSL: z.string().transform((v) => v === "true" || v === "1").default("false"),
});

function parseEnv(): z.infer<typeof EnvSchema> {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    console.error("Invalid environment:\n", result.error.format());
    process.exit(1);
  }
  return result.data;
}

function readVersion(): string {
  // Compiled to dist/config.js → import.meta.dirname = /app/dist
  // So ../VERSION = /app/VERSION (Docker), ../../VERSION = dev fallback
  const candidates = [
    path.resolve(import.meta.dirname, "../VERSION"),
    path.resolve(import.meta.dirname, "../../VERSION"),
  ];
  for (const p of candidates) {
    try {
      return readFileSync(p, "utf8").trim();
    } catch {
      // try next
    }
  }
  return "0.0.0-dev";
}

const env = parseEnv();

const configDir = env.CONFIG_DIR ?? path.join(homedir(), ".local", "share", "rocksmith-cdlc");

export const config = {
  port: env.PORT,
  host: env.HOST,
  logLevel: env.LOG_LEVEL,
  logPretty: env.LOG_PRETTY,
  demoMode: env.SLOPSMITH_DEMO_MODE,
  electronMode: env.ELECTRON_MODE,
  dlcDir: env.DLC_DIR,
  rscliPath: env.RSCLI_PATH,
  vgmstreamCli: env.VGMSTREAM_CLI,
  appSourceUrl: env.APP_SOURCE_URL,
  appLicenseUrl: env.APP_LICENSE_URL ?? `${env.APP_SOURCE_URL}/blob/main/LICENSE`,
  version: readVersion(),

  // Derived paths
  configDir,
  minioEndpoint: env.MINIO_ENDPOINT,
  minioPort: env.MINIO_PORT,
  minioAccessKey: env.MINIO_ACCESS_KEY,
  minioSecretKey: env.MINIO_SECRET_KEY,
  minioBucket: env.MINIO_BUCKET,
  minioUseSSL: env.MINIO_USE_SSL,

  databaseUrl: env.DATABASE_URL ?? "postgresql://slopsmith:slopsmith@localhost:5432/slopsmith",
  settingsPath: path.join(configDir, "config.json"),
  audioCacheDir: path.join(configDir, "audio_cache"),
  artCacheDir: path.join(configDir, "art_cache"),
  sloppakCacheDir: path.join(configDir, "sloppak_cache"),

  // Plugin directories — dist/config.js → /app/dist → ../plugins = /app/plugins
  pluginsBuiltinDir: path.resolve(import.meta.dirname, "../plugins"),
  pluginsUserDir: env.SLOPSMITH_PLUGINS_DIR,
  staticDir: path.resolve(import.meta.dirname, "../static"),

  sacServerName: env.SAC_SERVER_NAME,
  sacHttpPort:   env.SAC_HTTP_PORT ?? env.PORT,
} as const;

export type Config = typeof config;
