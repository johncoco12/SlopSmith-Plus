import { describe, it, expect, vi } from "vitest";
import { LoopService } from "../../src/services/LoopService.js";
import type { ILoopRepository } from "../../src/domain/repositories.js";
import type { Loop } from "../../src/domain/models/library.js";

function makeLoop(overrides: Partial<Loop> = {}): Loop {
  return {
    id: 1,
    filename: "song.psarc",
    name: "Loop 1",
    startTime: 0,
    endTime: 10,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeRepo(overrides: Partial<ILoopRepository> = {}): ILoopRepository {
  return {
    findByFilename: vi.fn(async () => []),
    create: vi.fn(async (filename, name, st, et) =>
      makeLoop({ filename, name: name ?? "Loop 1", startTime: st, endTime: et })
    ),
    delete: vi.fn(async () => {}),
    ...overrides,
  } as ILoopRepository;
}

describe("LoopService.getForSong", () => {
  it("delegates to repository findByFilename", async () => {
    const loops = [makeLoop({ name: "Intro" }), makeLoop({ id: 2, name: "Chorus" })];
    const repo = makeRepo({ findByFilename: vi.fn(async () => loops) });
    const service = new LoopService(repo);

    const result = await service.getForSong("song.psarc");
    expect(result).toEqual(loops);
    expect(repo.findByFilename).toHaveBeenCalledWith("song.psarc");
  });
});

describe("LoopService.create", () => {
  it("auto-generates name as 'Loop N' based on existing count", async () => {
    const existing = [makeLoop({ name: "Loop 1" }), makeLoop({ id: 2, name: "Loop 2" })];
    const repo = makeRepo({
      findByFilename: vi.fn(async () => existing),
      create: vi.fn(async (filename, name, st, et) =>
        makeLoop({ filename, name: name!, startTime: st, endTime: et })
      ),
    });
    const service = new LoopService(repo);

    await service.create("song.psarc", undefined, 5, 15);
    expect(repo.create).toHaveBeenCalledWith("song.psarc", "Loop 3", 5, 15);
  });

  it("uses provided name when given", async () => {
    const repo = makeRepo();
    const service = new LoopService(repo);
    await service.create("song.psarc", "My Loop", 0, 10);
    expect(repo.create).toHaveBeenCalledWith("song.psarc", "My Loop", 0, 10);
  });

  it("names first loop 'Loop 1' when no loops exist", async () => {
    const repo = makeRepo();
    const service = new LoopService(repo);
    await service.create("song.psarc", undefined, 0, 5);
    expect(repo.create).toHaveBeenCalledWith("song.psarc", "Loop 1", 0, 5);
  });

  it("returns the created loop from the repository", async () => {
    const created = makeLoop({ name: "Custom", startTime: 1, endTime: 9 });
    const repo = makeRepo({ create: vi.fn(async () => created) });
    const service = new LoopService(repo);
    const result = await service.create("song.psarc", "Custom", 1, 9);
    expect(result).toEqual(created);
  });
});

describe("LoopService.delete", () => {
  it("delegates to repository delete", async () => {
    const repo = makeRepo();
    const service = new LoopService(repo);
    await service.delete(42);
    expect(repo.delete).toHaveBeenCalledWith(42);
  });
});
