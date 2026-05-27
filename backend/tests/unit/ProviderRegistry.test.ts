import { describe, it, expect } from "vitest";
import { ProviderRegistry } from "../../src/infrastructure/plugins/ProviderRegistry.js";

describe("ProviderRegistry", () => {
  describe("register / get", () => {
    it("returns the first registered provider as active", () => {
      const reg = new ProviderRegistry();
      reg.register("theme", "dark", { color: "black" });
      expect(reg.get("theme")).toEqual({ color: "black" });
    });

    it("second registration of same type does not replace active", () => {
      const reg = new ProviderRegistry();
      reg.register("theme", "dark",  { v: 1 });
      reg.register("theme", "light", { v: 2 });
      expect(reg.get<{ v: number }>("theme")?.v).toBe(1);
    });

    it("returns null for an unregistered type", () => {
      const reg = new ProviderRegistry();
      expect(reg.get("theme")).toBeNull();
    });
  });

  describe("getByName", () => {
    it("retrieves a non-active named provider", () => {
      const reg = new ProviderRegistry();
      reg.register("theme", "dark",  { color: "black" });
      reg.register("theme", "light", { color: "white" });
      expect(reg.getByName<{ color: string }>("theme", "light")?.color).toBe("white");
    });

    it("returns null for an unknown name", () => {
      const reg = new ProviderRegistry();
      expect(reg.getByName("theme", "nope")).toBeNull();
    });
  });

  describe("setActive", () => {
    it("changes the active provider", () => {
      const reg = new ProviderRegistry();
      reg.register("theme", "dark",  { v: 1 });
      reg.register("theme", "light", { v: 2 });
      reg.setActive("theme", "light");
      expect(reg.get<{ v: number }>("theme")?.v).toBe(2);
    });

    it("throws when setting an unregistered name as active", () => {
      const reg = new ProviderRegistry();
      reg.register("theme", "dark", {});
      expect(() => reg.setActive("theme", "nope")).toThrow();
    });
  });

  describe("list / listTypes", () => {
    it("lists all providers with correct active flag", () => {
      const reg = new ProviderRegistry();
      reg.register("theme", "dark",  {});
      reg.register("theme", "light", {});
      const list = reg.list("theme");
      expect(list).toHaveLength(2);
      expect(list.find((p) => p.name === "dark")?.active).toBe(true);
      expect(list.find((p) => p.name === "light")?.active).toBe(false);
    });

    it("returns empty array for an unregistered type", () => {
      const reg = new ProviderRegistry();
      expect(reg.list("theme")).toEqual([]);
    });

    it("listTypes includes all registered types", () => {
      const reg = new ProviderRegistry();
      reg.register("theme", "dark",    {});
      reg.register("audio", "default", {});
      expect(reg.listTypes()).toContain("theme");
      expect(reg.listTypes()).toContain("audio");
    });
  });

  describe("unregisterAll", () => {
    it("removes providers owned by the given plugin", () => {
      const reg = new ProviderRegistry();
      reg.register("theme", "custom", {}, "plugin-a");
      reg.register("theme", "other",  {}, "plugin-b");
      reg.unregisterAll("plugin-a");
      expect(reg.list("theme").map((p) => p.name)).not.toContain("custom");
      expect(reg.list("theme").map((p) => p.name)).toContain("other");
    });

    it("promotes the next provider to active when the active one is removed", () => {
      const reg = new ProviderRegistry();
      reg.register("theme", "first",  { v: 1 }, "plugin-a");
      reg.register("theme", "second", { v: 2 }, "plugin-b");
      reg.unregisterAll("plugin-a");
      expect(reg.get<{ v: number }>("theme")?.v).toBe(2);
    });

    it("clears active entirely when the last provider for a type is removed", () => {
      const reg = new ProviderRegistry();
      reg.register("theme", "only", {}, "plugin-a");
      reg.unregisterAll("plugin-a");
      expect(reg.get("theme")).toBeNull();
    });

    it("does not affect providers owned by other plugins", () => {
      const reg = new ProviderRegistry();
      reg.register("theme", "a", { v: 1 }, "plugin-a");
      reg.register("theme", "b", { v: 2 }, "plugin-b");
      reg.unregisterAll("plugin-a");
      expect(reg.get<{ v: number }>("theme")?.v).toBe(2);
    });
  });

  describe("ownership", () => {
    it("clears ownership when a provider is re-registered without a pluginId", () => {
      const reg = new ProviderRegistry();
      reg.register("theme", "dark", { v: 1 }, "plugin-a");
      // re-register without pluginId — now unowned
      reg.register("theme", "dark", { v: 2 });
      reg.unregisterAll("plugin-a");
      // "dark" is now unowned so unregisterAll should NOT have removed it
      expect(reg.get<{ v: number }>("theme")?.v).toBe(2);
    });
  });
});
