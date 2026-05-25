import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildTestApp } from "../helpers/build-app.js";
import { NotFoundError } from "../../src/domain/errors.js";
import type { PluginManifest, LoadedPlugin } from "../../src/domain/models/plugin.js";
import type { FastifyInstance } from "fastify";

function makePlugin(id: string): LoadedPlugin {
  return {
    id,
    name: `Plugin ${id}`,
    version: "1.0.0",
    bundled: true,
    dir: `/plugins/${id}`,
    manifest: { id, name: `Plugin ${id}` } as PluginManifest,
    capabilities: {
      hasScreen: true,
      hasScript: true,
      hasSettings: false,
      hasTour: false,
    },
  };
}

describe("GET /api/plugins", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildTestApp({
      plugins: {
        getAll: () => [makePlugin("highway_3d"), makePlugin("note_detect")],
      },
    });
    await app.ready();
  });

  afterAll(() => app.close());

  it("returns 200 with plugins array", async () => {
    const res = await app.inject({ method: "GET", url: "/api/plugins" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("plugins");
    expect(body.plugins).toHaveLength(2);
  });

  it("includes id, name, version, bundled, capabilities fields", async () => {
    const body = (await app.inject({ method: "GET", url: "/api/plugins" })).json();
    const plugin = body.plugins[0];
    expect(plugin).toHaveProperty("id");
    expect(plugin).toHaveProperty("name");
    expect(plugin).toHaveProperty("version");
    expect(plugin).toHaveProperty("bundled");
    expect(plugin).toHaveProperty("capabilities");
  });

  it("returns empty array when no plugins are loaded", async () => {
    const app2 = buildTestApp({ plugins: { getAll: () => [] } });
    await app2.ready();
    const body = (await app2.inject({ method: "GET", url: "/api/plugins" })).json();
    expect(body.plugins).toHaveLength(0);
    await app2.close();
  });
});

describe("GET /api/plugins/:id/file/:filename", () => {
  it("returns 404 when plugin does not exist", async () => {
    const app = buildTestApp({
      plugins: {
        resolveFile: () => { throw new NotFoundError('Plugin "unknown"'); },
      },
    });
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: "/api/plugins/unknown/file/screen.js",
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
