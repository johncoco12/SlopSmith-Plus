import { describe, it, expect } from "vitest";
import {
  AppError,
  NotFoundError,
  ValidationError,
  ConfigurationError,
  PathTraversalError,
  ExtractionError,
  AudioConversionError,
  DemoModeError,
} from "../../src/domain/errors.js";

describe("AppError hierarchy", () => {
  it("AppError is an instanceof Error", () => {
    const err = new AppError("test", 500);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(500);
    expect(err.message).toBe("test");
  });

  it("NotFoundError has status 404", () => {
    const err = new NotFoundError("Song");
    expect(err.statusCode).toBe(404);
    expect(err.message).toContain("Song");
    expect(err).toBeInstanceOf(AppError);
  });

  it("ValidationError has status 400", () => {
    const err = new ValidationError("bad input");
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe("bad input");
  });

  it("ConfigurationError has status 500", () => {
    const err = new ConfigurationError("missing env var");
    expect(err.statusCode).toBe(500);
  });

  it("PathTraversalError has status 400", () => {
    const err = new PathTraversalError();
    expect(err.statusCode).toBe(400);
    expect(err.message).toMatch(/traversal/i);
  });

  it("ExtractionError has status 500", () => {
    const err = new ExtractionError("failed");
    expect(err.statusCode).toBe(500);
  });

  it("AudioConversionError has status 500", () => {
    const err = new AudioConversionError("vgmstream failed");
    expect(err.statusCode).toBe(500);
  });

  it("DemoModeError has status 403", () => {
    const err = new DemoModeError();
    expect(err.statusCode).toBe(403);
    expect(err.message).toMatch(/demo/i);
  });
});
