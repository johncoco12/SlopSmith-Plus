import { describe, it, expect } from "vitest";
import { tuningName, tuningSortKey } from "../../src/infrastructure/formats/tunings.js";

describe("tuningName", () => {
  it("returns 'E Standard' for all-zero 6-string tuning", () => {
    expect(tuningName([0, 0, 0, 0, 0, 0])).toBe("E Standard");
  });

  it("returns 'E Standard' for all-zero 4-string bass tuning", () => {
    expect(tuningName([0, 0, 0, 0])).toBe("E Standard");
  });

  it("identifies Drop D tuning", () => {
    const name = tuningName([-2, 0, 0, 0, 0, 0]);
    expect(name).toMatch(/[Dd]rop/i);
  });

  it("identifies Eb Standard tuning", () => {
    const name = tuningName([-1, -1, -1, -1, -1, -1]);
    expect(name).toMatch(/Eb|E♭|E flat/i);
  });

  it("returns a non-empty string for unknown tunings", () => {
    const name = tuningName([3, -2, 1, 0, -1, 2]);
    expect(name.length).toBeGreaterThan(0);
  });
});

describe("tuningSortKey", () => {
  it("returns a finite number for standard tuning", () => {
    const key = tuningSortKey([0, 0, 0, 0, 0, 0]);
    expect(Number.isFinite(key)).toBe(true);
  });

  it("sorts E Standard before Eb Standard (lower = higher pitch)", () => {
    const eStd = tuningSortKey([0, 0, 0, 0, 0, 0]);
    const ebStd = tuningSortKey([-1, -1, -1, -1, -1, -1]);
    expect(eStd).toBeGreaterThan(ebStd);
  });

  it("returns same key for same offsets regardless of string count", () => {
    const fourString = tuningSortKey([0, 0, 0, 0]);
    const sixString = tuningSortKey([0, 0, 0, 0, 0, 0]);
    expect(fourString).toBe(sixString);
  });
});
