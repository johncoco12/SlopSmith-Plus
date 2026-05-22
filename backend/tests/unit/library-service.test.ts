import { describe, it, expect, vi } from "vitest";
import { LibraryService } from "../../src/services/LibraryService.js";
import type { ISongRepository, IFavoritesRepository } from "../../src/domain/repositories.js";
import type { LibraryQuery } from "../../src/domain/models/library.js";

function makeQuery(overrides: Partial<LibraryQuery> = {}): LibraryQuery {
  return {
    page: 1,
    size: 50,
    sort: "artist",
    favoritesOnly: false,
    arrangementsHas: [],
    arrangementsLacks: [],
    stemsHas: [],
    stemsLacks: [],
    tunings: [],
    ...overrides,
  };
}

function makeRepos(
  songOverrides: Partial<ISongRepository> = {},
  favOverrides: Partial<IFavoritesRepository> = {},
) {
  const songs: ISongRepository = {
    search: vi.fn(async () => ({ items: [], total: 0, page: 1, size: 50 })),
    artists: vi.fn(async () => ({ items: [], total: 0, page: 1, size: 20 })),
    stats: vi.fn(async () => ({ totalSongs: 0, totalArtists: 0, letters: {} })),
    tuningNames: vi.fn(async () => []),
    findByFilename: vi.fn(async () => null),
    findCached: vi.fn(async () => null),
    upsert: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    deleteStale: vi.fn(async () => {}),
    ...songOverrides,
  } as ISongRepository;

  const favorites: IFavoritesRepository = {
    isFavorite: vi.fn(async () => false),
    toggle: vi.fn(async () => true),
    getAllFilenames: vi.fn(async () => new Set<string>()),
    ...favOverrides,
  };

  return { songs, favorites };
}

describe("LibraryService.search", () => {
  it("delegates to song repository search", async () => {
    const { songs, favorites } = makeRepos();
    const service = new LibraryService(songs, favorites);
    const query = makeQuery({ q: "metallica" });
    await service.search(query);
    expect(songs.search).toHaveBeenCalledWith(query);
  });
});

describe("LibraryService.artists", () => {
  it("delegates to song repository artists", async () => {
    const { songs, favorites } = makeRepos();
    const service = new LibraryService(songs, favorites);
    const opts = { page: 1, size: 20, favoritesOnly: false };
    await service.artists(opts);
    expect(songs.artists).toHaveBeenCalledWith(opts);
  });
});

describe("LibraryService.stats", () => {
  it("returns stats from repository", async () => {
    const { songs, favorites } = makeRepos({
      stats: vi.fn(async () => ({ totalSongs: 15, totalArtists: 5, letters: { M: 3 } })),
    });
    const service = new LibraryService(songs, favorites);
    const result = await service.stats();
    expect(result.totalSongs).toBe(15);
    expect(result.totalArtists).toBe(5);
  });
});

describe("LibraryService.tuningNames", () => {
  it("returns tuning names from repository", async () => {
    const { songs, favorites } = makeRepos({
      tuningNames: vi.fn(async () => [
        { name: "E Standard", count: 10 },
        { name: "Drop D", count: 2 },
      ]),
    });
    const service = new LibraryService(songs, favorites);
    const result = await service.tuningNames();
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("E Standard");
  });
});

describe("LibraryService.toggleFavorite", () => {
  it("delegates to favorites repository toggle", async () => {
    const { songs, favorites } = makeRepos();
    const service = new LibraryService(songs, favorites);
    const result = await service.toggleFavorite("song.psarc", 1);
    expect(favorites.toggle).toHaveBeenCalledWith("song.psarc", 1);
    expect(result).toBe(true);
  });

  it("returns false when toggle removes the favorite", async () => {
    const { songs, favorites } = makeRepos(
      {},
      { toggle: vi.fn(async () => false) },
    );
    const service = new LibraryService(songs, favorites);
    const result = await service.toggleFavorite("song.psarc", 1);
    expect(result).toBe(false);
  });
});
