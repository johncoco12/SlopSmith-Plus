import { describe, it, expect } from "vitest";
import { PermissionRegistry } from "../../src/infrastructure/plugins/PermissionRegistry.js";

describe("PermissionRegistry", () => {
  describe("define / list", () => {
    it("adds a permission and returns it via list()", () => {
      const reg = new PermissionRegistry();
      reg.define("plugin-a", "perm:read", "Can read");
      expect(reg.list()).toEqual([
        { name: "perm:read", description: "Can read", pluginId: "plugin-a" },
      ]);
    });

    it("accumulates multiple permissions", () => {
      const reg = new PermissionRegistry();
      reg.define("plugin-a", "a:one", "A1");
      reg.define("plugin-a", "a:two", "A2");
      expect(reg.list()).toHaveLength(2);
    });
  });

  describe("has", () => {
    it("returns true for a defined permission", () => {
      const reg = new PermissionRegistry();
      reg.define("plugin-a", "perm:read", "Can read");
      expect(reg.has("perm:read")).toBe(true);
    });

    it("returns false for an undefined permission", () => {
      const reg = new PermissionRegistry();
      expect(reg.has("perm:write")).toBe(false);
    });
  });

  describe("duplicate handling", () => {
    it("is a no-op when the same plugin re-defines the same permission", () => {
      const reg = new PermissionRegistry();
      reg.define("plugin-a", "perm:read", "Can read");
      expect(() => reg.define("plugin-a", "perm:read", "Duplicate")).not.toThrow();
      expect(reg.list()).toHaveLength(1);
    });

    it("throws when a different plugin tries to define the same permission name", () => {
      const reg = new PermissionRegistry();
      reg.define("plugin-a", "perm:read", "A read");
      expect(() => reg.define("plugin-b", "perm:read", "B read")).toThrow();
    });
  });

  describe("listForPlugin", () => {
    it("filters permissions by plugin id", () => {
      const reg = new PermissionRegistry();
      reg.define("plugin-a", "a:one", "A1");
      reg.define("plugin-a", "a:two", "A2");
      reg.define("plugin-b", "b:one", "B1");
      expect(reg.listForPlugin("plugin-a")).toHaveLength(2);
      expect(reg.listForPlugin("plugin-b")).toHaveLength(1);
    });

    it("returns empty array for an unknown plugin", () => {
      const reg = new PermissionRegistry();
      expect(reg.listForPlugin("nobody")).toEqual([]);
    });
  });

  describe("unregisterAll", () => {
    it("removes all permissions belonging to the given plugin", () => {
      const reg = new PermissionRegistry();
      reg.define("plugin-a", "a:one", "A1");
      reg.define("plugin-a", "a:two", "A2");
      reg.define("plugin-b", "b:one", "B1");
      reg.unregisterAll("plugin-a");
      expect(reg.list().map((d) => d.name)).toEqual(["b:one"]);
    });

    it("allows re-defining the permission after it has been unregistered", () => {
      const reg = new PermissionRegistry();
      reg.define("plugin-a", "perm:x", "X");
      reg.unregisterAll("plugin-a");
      expect(() => reg.define("plugin-b", "perm:x", "X again")).not.toThrow();
    });
  });
});
