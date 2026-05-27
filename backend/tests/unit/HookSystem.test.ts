import { describe, it, expect, vi } from "vitest";
import { HookSystem } from "../../src/infrastructure/plugins/HookSystem.js";

describe("HookSystem", () => {
  describe("register / emit", () => {
    it("fires a registered handler on emit", async () => {
      const hooks = new HookSystem();
      const handler = vi.fn();
      hooks.register("test:event", "plugin-a", handler);
      await hooks.emit("test:event");
      expect(handler).toHaveBeenCalledOnce();
    });

    it("passes data to the handler payload", async () => {
      const hooks = new HookSystem();
      let received: unknown;
      hooks.register("test:event", "plugin-a", (p) => { received = p.data; });
      await hooks.emit("test:event", { foo: "bar" });
      expect(received).toMatchObject({ foo: "bar" });
    });

    it("exposes event name and timestamp on the payload", async () => {
      const hooks = new HookSystem();
      let payload: { event: string; timestamp: number } | undefined;
      hooks.register("my:event", "p", (p) => { payload = p; });
      await hooks.emit("my:event");
      expect(payload?.event).toBe("my:event");
      expect(typeof payload?.timestamp).toBe("number");
    });

    it("fires nothing for an unregistered event", async () => {
      const hooks = new HookSystem();
      const handler = vi.fn();
      hooks.register("test:event", "plugin-a", handler);
      await hooks.emit("other:event");
      expect(handler).not.toHaveBeenCalled();
    });

    it("fires multiple handlers registered on the same event", async () => {
      const hooks = new HookSystem();
      const h1 = vi.fn(), h2 = vi.fn();
      hooks.register("e", "p1", h1);
      hooks.register("e", "p2", h2);
      await hooks.emit("e");
      expect(h1).toHaveBeenCalledOnce();
      expect(h2).toHaveBeenCalledOnce();
    });
  });

  describe("priority ordering", () => {
    it("fires lower-priority-number handlers first", async () => {
      const hooks = new HookSystem();
      const order: number[] = [];
      hooks.register("e", "p", () => { order.push(200); }, { priority: 200 });
      hooks.register("e", "p", () => { order.push(50); },  { priority: 50  });
      hooks.register("e", "p", () => { order.push(100); }, { priority: 100 });
      await hooks.emit("e");
      expect(order).toEqual([50, 100, 200]);
    });
  });

  describe("before / after phases", () => {
    it("fires before-phase handlers before after-phase ones regardless of registration order", async () => {
      const hooks = new HookSystem();
      const order: string[] = [];
      hooks.register("e", "p", () => { order.push("after"); },  { phase: "after"  });
      hooks.register("e", "p", () => { order.push("before"); }, { phase: "before" });
      await hooks.emit("e");
      expect(order).toEqual(["before", "after"]);
    });
  });

  describe("abort", () => {
    it("stops subsequent handlers when payload.abort() is called", async () => {
      const hooks = new HookSystem();
      const second = vi.fn();
      hooks.register("e", "p", (p) => { p.abort(); }, { priority: 1 });
      hooks.register("e", "p", second,                  { priority: 2 });
      await hooks.emit("e");
      expect(second).not.toHaveBeenCalled();
    });
  });

  describe("error isolation", () => {
    it("does not prevent later handlers from running if one throws", async () => {
      const hooks = new HookSystem();
      const second = vi.fn();
      hooks.register("e", "p", () => { throw new Error("boom"); }, { priority: 1 });
      hooks.register("e", "p", second,                              { priority: 2 });
      await expect(hooks.emit("e")).resolves.toBeDefined();
      expect(second).toHaveBeenCalledOnce();
    });
  });

  describe("result data merging", () => {
    it("merges result.data into subsequent payload.data", async () => {
      const hooks = new HookSystem();
      let seen: unknown;
      hooks.register("e", "p", () => ({ data: { enriched: true } }), { priority: 1 });
      hooks.register("e", "p", (p) => { seen = p.data.enriched; },   { priority: 2 });
      await hooks.emit("e");
      expect(seen).toBe(true);
    });
  });

  describe("unregister", () => {
    it("removes a specific handler so it is not called on next emit", async () => {
      const hooks = new HookSystem();
      const handler = vi.fn();
      hooks.register("e", "p", handler);
      hooks.unregister("e", "p", handler);
      await hooks.emit("e");
      expect(handler).not.toHaveBeenCalled();
    });

    it("does not remove handlers from other plugins", async () => {
      const hooks = new HookSystem();
      const ha = vi.fn(), hb = vi.fn();
      hooks.register("e", "plugin-a", ha);
      hooks.register("e", "plugin-b", hb);
      hooks.unregister("e", "plugin-a", ha);
      await hooks.emit("e");
      expect(ha).not.toHaveBeenCalled();
      expect(hb).toHaveBeenCalledOnce();
    });
  });

  describe("unregisterAll", () => {
    it("removes all handlers for the given plugin across all events", async () => {
      const hooks = new HookSystem();
      const h1 = vi.fn(), h2 = vi.fn(), h3 = vi.fn();
      hooks.register("e1", "plugin-a", h1);
      hooks.register("e2", "plugin-a", h2);
      hooks.register("e1", "plugin-b", h3);
      hooks.unregisterAll("plugin-a");
      await hooks.emit("e1");
      await hooks.emit("e2");
      expect(h1).not.toHaveBeenCalled();
      expect(h2).not.toHaveBeenCalled();
      expect(h3).toHaveBeenCalledOnce();
    });
  });
});
