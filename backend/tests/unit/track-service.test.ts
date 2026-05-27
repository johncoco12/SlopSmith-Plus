import { describe, it, expect, vi } from "vitest";
import { TrackService } from "../../src/services/TrackService.js";
import type { ITrackRepository, ITrackDataRepository, IStemsRepository, IStemDataRepository, ILoopRepository, IFavoritesRepository, ISongRepository } from "../../src/domain/repositories.js";
import type { Track, TrackData, TrackStems, StemData } from "../../src/domain/models/track.js";
import type { Loop } from "../../src/domain/models/library.js";
import type { IStorageService } from "../../src/domain/interfaces/services/IStorageService.js";
import { NotFoundError } from "../../src/domain/errors.js";

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 1,
    trackId: "track_abc",
    artist: "TestArtist",
    title: "TestTrack",
    album: "TestAlbum",
    year: "2024",
    duration: 120,
    tuning: "E Standard",
    hasLyrics: false,
    format: "psarc",
    tuningName: "E Standard",
    tuningSortKey: 0,
    trackData: null,
    stems: null,
    createdAt: new Date(),
    modifiedAt: new Date(),
    ...overrides,
  };
}

function makeTrackData(overrides: Partial<TrackData> = {}): TrackData {
  return {
    id: 1,
    trackId: 1,
    originalFilename: "song.psarc",
    arrangements: [],
    coverImageStorageId: null,
    audioFileStorageId: null,
    ...overrides,
  };
}

function makeStems(overrides: Partial<TrackStems> = {}): TrackStems {
  return {
    id: 1,
    trackId: 1,
    stems: [],
    ...overrides,
  };
}

function makeStemData(overrides: Partial<StemData> = {}): StemData {
  return {
    id: 1,
    trackId: 1,
    stemIndex: 0,
    arrangement: "Lead",
    stemAudioFileStorageId: "stem_audio_1",
    ...overrides,
  };
}

function makeLoop(overrides: Partial<Loop> = {}): Loop {
  return {
    id: 1,
    profileId: 1,
    trackId: 1,
    name: "Loop 1",
    startTime: 0,
    endTime: 10,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeStorage(overrides: Partial<IStorageService> = {}): IStorageService {
  return {
    store: vi.fn(async () => ({ identifier: "id", size: 100, uploadedAt: new Date() })),
    storeFromPath: vi.fn(async () => ({ identifier: "id", size: 100, uploadedAt: new Date() })),
    get: vi.fn(async () => Buffer.from("data")),
    delete: vi.fn(async () => {}),
    exists: vi.fn(async () => true),
    ...overrides,
  };
}

function makeRepos(overrides: {
  tracks?: Partial<ITrackRepository>;
  trackData?: Partial<ITrackDataRepository>;
  stems?: Partial<IStemsRepository>;
  stemData?: Partial<IStemDataRepository>;
  loops?: Partial<ILoopRepository>;
  storage?: Partial<IStorageService>;
} = {}) {
  const tracks: ITrackRepository = {
    findById: vi.fn(async () => null),
    findByTrackId: vi.fn(async () => null),
    findAll: vi.fn(async () => []),
    create: vi.fn(async () => makeTrack()),
    update: vi.fn(async () => makeTrack()),
    delete: vi.fn(async () => {}),
    ...overrides.tracks,
  } as ITrackRepository;

  const trackData: ITrackDataRepository = {
    findByTrackId: vi.fn(async () => null),
    findByOriginalFilename: vi.fn(async () => null),
    create: vi.fn(async () => makeTrackData()),
    update: vi.fn(async () => makeTrackData()),
    delete: vi.fn(async () => {}),
    ...overrides.trackData,
  } as ITrackDataRepository;

  const stems: IStemsRepository = {
    findByTrackId: vi.fn(async () => null),
    create: vi.fn(async () => makeStems()),
    delete: vi.fn(async () => {}),
    ...overrides.stems,
  } as IStemsRepository;

  const stemData: IStemDataRepository = {
    findByStemsId: vi.fn(async () => []),
    create: vi.fn(async () => makeStemData()),
    update: vi.fn(async () => makeStemData()),
    delete: vi.fn(async () => {}),
    ...overrides.stemData,
  } as IStemDataRepository;

  const loops: ILoopRepository = {
    findByTrackId: vi.fn(async () => []),
    create: vi.fn(async () => makeLoop()),
    delete: vi.fn(async () => {}),
    ...overrides.loops,
  } as ILoopRepository;

  const storage = makeStorage(overrides.storage);

  return { tracks, trackData, stems, stemData, loops, storage };
}

describe("TrackService.getTrack", () => {
  it("returns track when found", async () => {
    const track = makeTrack();
    const repos = makeRepos({ tracks: { findByTrackId: vi.fn(async () => track) } });
    const service = new TrackService(repos.tracks, repos.trackData, repos.stems, repos.stemData, repos.loops, repos.storage);
    const result = await service.getTrack("track_abc");
    expect(result).toEqual(track);
    expect(repos.tracks.findByTrackId).toHaveBeenCalledWith("track_abc");
  });

  it("throws NotFoundError when track not found", async () => {
    const repos = makeRepos({ tracks: { findByTrackId: vi.fn(async () => null) } });
    const service = new TrackService(repos.tracks, repos.trackData, repos.stems, repos.stemData, repos.loops, repos.storage);
    await expect(service.getTrack("missing")).rejects.toThrow(NotFoundError);
  });
});

describe("TrackService.getTrackData", () => {
  it("returns track data when found", async () => {
    const track = makeTrack();
    const data = makeTrackData();
    const repos = makeRepos({
      tracks: { findByTrackId: vi.fn(async () => track) },
      trackData: { findByTrackId: vi.fn(async () => data) },
    });
    const service = new TrackService(repos.tracks, repos.trackData, repos.stems, repos.stemData, repos.loops, repos.storage);
    const result = await service.getTrackData("track_abc");
    expect(result).toEqual(data);
  });

  it("throws NotFoundError when track not found", async () => {
    const repos = makeRepos({ tracks: { findByTrackId: vi.fn(async () => null) } });
    const service = new TrackService(repos.tracks, repos.trackData, repos.stems, repos.stemData, repos.loops, repos.storage);
    await expect(service.getTrackData("missing")).rejects.toThrow(NotFoundError);
  });

  it("throws NotFoundError when track data not found", async () => {
    const track = makeTrack();
    const repos = makeRepos({
      tracks: { findByTrackId: vi.fn(async () => track) },
      trackData: { findByTrackId: vi.fn(async () => null) },
    });
    const service = new TrackService(repos.tracks, repos.trackData, repos.stems, repos.stemData, repos.loops, repos.storage);
    await expect(service.getTrackData("track_abc")).rejects.toThrow(NotFoundError);
  });
});

describe("TrackService.getStems", () => {
  it("returns empty array when no stems record exists", async () => {
    const track = makeTrack();
    const repos = makeRepos({
      tracks: { findByTrackId: vi.fn(async () => track) },
      stems: { findByTrackId: vi.fn(async () => null) },
    });
    const service = new TrackService(repos.tracks, repos.trackData, repos.stems, repos.stemData, repos.loops, repos.storage);
    const result = await service.getStems("track_abc");
    expect(result).toEqual([]);
  });

  it("returns stem data when stems record exists", async () => {
    const track = makeTrack();
    const stemsRecord = makeStems();
    const stemItems = [makeStemData({ stemIndex: 0 }), makeStemData({ id: 2, stemIndex: 1 })];
    const repos = makeRepos({
      tracks: { findByTrackId: vi.fn(async () => track) },
      stems: { findByTrackId: vi.fn(async () => stemsRecord) },
      stemData: { findByStemsId: vi.fn(async () => stemItems) },
    });
    const service = new TrackService(repos.tracks, repos.trackData, repos.stems, repos.stemData, repos.loops, repos.storage);
    const result = await service.getStems("track_abc");
    expect(result).toEqual(stemItems);
  });

  it("throws NotFoundError when track not found", async () => {
    const repos = makeRepos({ tracks: { findByTrackId: vi.fn(async () => null) } });
    const service = new TrackService(repos.tracks, repos.trackData, repos.stems, repos.stemData, repos.loops, repos.storage);
    await expect(service.getStems("missing")).rejects.toThrow(NotFoundError);
  });
});

describe("TrackService.getCoverArt", () => {
  it("returns null when no cover image storage id", async () => {
    const track = makeTrack();
    const data = makeTrackData({ coverImageStorageId: null });
    const repos = makeRepos({
      tracks: { findByTrackId: vi.fn(async () => track) },
      trackData: { findByTrackId: vi.fn(async () => data) },
    });
    const service = new TrackService(repos.tracks, repos.trackData, repos.stems, repos.stemData, repos.loops, repos.storage);
    const result = await service.getCoverArt("track_abc");
    expect(result).toBeNull();
  });

  it("returns cover art buffer when found", async () => {
    const track = makeTrack();
    const artBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const data = makeTrackData({ coverImageStorageId: "cover_1" });
    const repos = makeRepos({
      tracks: { findByTrackId: vi.fn(async () => track) },
      trackData: { findByTrackId: vi.fn(async () => data) },
      storage: { get: vi.fn(async () => artBuffer) },
    });
    const service = new TrackService(repos.tracks, repos.trackData, repos.stems, repos.stemData, repos.loops, repos.storage);
    const result = await service.getCoverArt("track_abc");
    expect(result).not.toBeNull();
    expect(result!.data).toEqual(artBuffer);
    expect(result!.mimeType).toBe("image/png");
  });

  it("returns null when storage get returns null", async () => {
    const track = makeTrack();
    const data = makeTrackData({ coverImageStorageId: "cover_1" });
    const repos = makeRepos({
      tracks: { findByTrackId: vi.fn(async () => track) },
      trackData: { findByTrackId: vi.fn(async () => data) },
      storage: { get: vi.fn(async () => null) },
    });
    const service = new TrackService(repos.tracks, repos.trackData, repos.stems, repos.stemData, repos.loops, repos.storage);
    const result = await service.getCoverArt("track_abc");
    expect(result).toBeNull();
  });
});

describe("TrackService.getAudio", () => {
  it("returns audio buffer when found", async () => {
    const track = makeTrack();
    const audioBuffer = Buffer.from("fake audio data");
    const data = makeTrackData({ audioFileStorageId: "audio_1" });
    const repos = makeRepos({
      tracks: { findByTrackId: vi.fn(async () => track) },
      trackData: { findByTrackId: vi.fn(async () => data) },
      storage: { get: vi.fn(async () => audioBuffer) },
    });
    const service = new TrackService(repos.tracks, repos.trackData, repos.stems, repos.stemData, repos.loops, repos.storage);
    const result = await service.getAudio("track_abc");
    expect(result).not.toBeNull();
    expect(result!.data).toEqual(audioBuffer);
    expect(result!.mimeType).toBe("audio/mpeg");
  });

  it("returns null when no audio file storage id", async () => {
    const track = makeTrack();
    const data = makeTrackData({ audioFileStorageId: null });
    const repos = makeRepos({
      tracks: { findByTrackId: vi.fn(async () => track) },
      trackData: { findByTrackId: vi.fn(async () => data) },
    });
    const service = new TrackService(repos.tracks, repos.trackData, repos.stems, repos.stemData, repos.loops, repos.storage);
    const result = await service.getAudio("track_abc");
    expect(result).toBeNull();
  });
});

describe("TrackService.getStemAudio", () => {
  it("returns null when no stem matches", async () => {
    const track = makeTrack();
    const repos = makeRepos({
      tracks: { findByTrackId: vi.fn(async () => track) },
      stems: { findByTrackId: vi.fn(async () => null) },
    });
    const service = new TrackService(repos.tracks, repos.trackData, repos.stems, repos.stemData, repos.loops, repos.storage);
    const result = await service.getStemAudio("track_abc", 0);
    expect(result).toBeNull();
  });

  it("returns stem audio when found", async () => {
    const track = makeTrack();
    const stemsRecord = makeStems();
    const stem = makeStemData({ stemIndex: 0, stemAudioFileStorageId: "stem_audio_1" });
    const audioBuffer = Buffer.from("stem audio");
    const repos = makeRepos({
      tracks: { findByTrackId: vi.fn(async () => track) },
      stems: { findByTrackId: vi.fn(async () => stemsRecord) },
      stemData: { findByStemsId: vi.fn(async () => [stem]) },
      storage: { get: vi.fn(async () => audioBuffer) },
    });
    const service = new TrackService(repos.tracks, repos.trackData, repos.stems, repos.stemData, repos.loops, repos.storage);
    const result = await service.getStemAudio("track_abc", 0);
    expect(result).not.toBeNull();
    expect(result!.data).toEqual(audioBuffer);
    expect(result!.mimeType).toBe("audio/ogg");
  });

  it("returns null when stem has no audio storage id", async () => {
    const track = makeTrack();
    const stemsRecord = makeStems();
    const stem = makeStemData({ stemIndex: 0, stemAudioFileStorageId: null });
    const repos = makeRepos({
      tracks: { findByTrackId: vi.fn(async () => track) },
      stems: { findByTrackId: vi.fn(async () => stemsRecord) },
      stemData: { findByStemsId: vi.fn(async () => [stem]) },
    });
    const service = new TrackService(repos.tracks, repos.trackData, repos.stems, repos.stemData, repos.loops, repos.storage);
    const result = await service.getStemAudio("track_abc", 0);
    expect(result).toBeNull();
  });
});

describe("TrackService.getLoops", () => {
  it("returns loops for a track and profile", async () => {
    const track = makeTrack();
    const loops = [makeLoop(), makeLoop({ id: 2, name: "Loop 2" })];
    const repos = makeRepos({
      tracks: { findByTrackId: vi.fn(async () => track) },
      loops: { findByTrackId: vi.fn(async () => loops) },
    });
    const service = new TrackService(repos.tracks, repos.trackData, repos.stems, repos.stemData, repos.loops, repos.storage);
    const result = await service.getLoops("track_abc", 1);
    expect(result).toEqual(loops);
    expect(repos.loops.findByTrackId).toHaveBeenCalledWith(1, 1);
  });

  it("throws NotFoundError when track not found", async () => {
    const repos = makeRepos({ tracks: { findByTrackId: vi.fn(async () => null) } });
    const service = new TrackService(repos.tracks, repos.trackData, repos.stems, repos.stemData, repos.loops, repos.storage);
    await expect(service.getLoops("missing", 1)).rejects.toThrow(NotFoundError);
  });
});

describe("TrackService.addLoop", () => {
  it("auto-generates name as Loop N based on existing count", async () => {
    const track = makeTrack();
    const existing = [makeLoop({ name: "Loop 1" }), makeLoop({ id: 2, name: "Loop 2" })];
    const created = makeLoop({ name: "Loop 3", startTime: 5, endTime: 15 });
    const repos = makeRepos({
      tracks: { findByTrackId: vi.fn(async () => track) },
      loops: {
        findByTrackId: vi.fn(async () => existing),
        create: vi.fn(async () => created),
      },
    });
    const service = new TrackService(repos.tracks, repos.trackData, repos.stems, repos.stemData, repos.loops, repos.storage);
    const result = await service.addLoop("track_abc", 1, undefined, 5, 15);
    expect(result).toEqual(created);
    expect(repos.loops.create).toHaveBeenCalledWith(1, 1, "Loop 3", 5, 15);
  });

  it("uses provided name when given", async () => {
    const track = makeTrack();
    const created = makeLoop({ name: "Chorus" });
    const repos = makeRepos({
      tracks: { findByTrackId: vi.fn(async () => track) },
      loops: {
        findByTrackId: vi.fn(async () => []),
        create: vi.fn(async () => created),
      },
    });
    const service = new TrackService(repos.tracks, repos.trackData, repos.stems, repos.stemData, repos.loops, repos.storage);
    const result = await service.addLoop("track_abc", 1, "Chorus", 30, 60);
    expect(result).toEqual(created);
    expect(repos.loops.create).toHaveBeenCalledWith(1, 1, "Chorus", 30, 60);
  });

  it("throws NotFoundError when track not found", async () => {
    const repos = makeRepos({ tracks: { findByTrackId: vi.fn(async () => null) } });
    const service = new TrackService(repos.tracks, repos.trackData, repos.stems, repos.stemData, repos.loops, repos.storage);
    await expect(service.addLoop("missing", 1, "Loop", 0, 10)).rejects.toThrow(NotFoundError);
  });
});

describe("TrackService.deleteLoop", () => {
  it("delegates to loop repository delete", async () => {
    const repos = makeRepos();
    const service = new TrackService(repos.tracks, repos.trackData, repos.stems, repos.stemData, repos.loops, repos.storage);
    await service.deleteLoop(42);
    expect(repos.loops.delete).toHaveBeenCalledWith(42);
  });
});

// ─── Additional coverage ──────────────────────────────────────────────────────

function makeFavorites(overrides: Partial<IFavoritesRepository> = {}): IFavoritesRepository {
  return {
    isFavorite: vi.fn(async () => false),
    toggle: vi.fn(async () => false),
    getAllFilenames: vi.fn(async () => new Set<string>()),
    getFavoritesByProfile: vi.fn(async () => new Set<string>()),
    deleteByTrackId: vi.fn(async () => {}),
    ...overrides,
  } as IFavoritesRepository;
}

function makeSongsRepo(overrides: Partial<ISongRepository> = {}): ISongRepository {
  return {
    search: vi.fn(async () => ({ items: [], total: 0, page: 1, size: 50 })),
    artists: vi.fn(async () => ({ items: [], total: 0, page: 1, size: 20 })),
    stats: vi.fn(async () => ({ totalSongs: 0, totalArtists: 0, letters: {} })),
    tuningNames: vi.fn(async () => []),
    findByFilename: vi.fn(async () => null),
    findCached: vi.fn(async () => null),
    upsert: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    deleteStale: vi.fn(async () => 0),
    deleteOrphaned: vi.fn(async () => 0),
    ...overrides,
  } as ISongRepository;
}

describe("TrackService.getCovers", () => {
  it("returns cover track ids from trackData repository", async () => {
    const ids = ["track_1", "track_2", "track_3"];
    const repos = makeRepos({
      trackData: { findWithCovers: vi.fn(async () => ids) },
    });
    const service = new TrackService(repos.tracks, repos.trackData, repos.stems, repos.stemData, repos.loops, repos.storage);
    const result = await service.getCovers(3);
    expect(result).toEqual(ids);
  });

  it("delegates the count argument to the repository", async () => {
    const repos = makeRepos({
      trackData: { findWithCovers: vi.fn(async () => []) },
    });
    const service = new TrackService(repos.tracks, repos.trackData, repos.stems, repos.stemData, repos.loops, repos.storage);
    await service.getCovers(10);
    expect(repos.trackData.findWithCovers).toHaveBeenCalledWith(10);
  });
});

describe("TrackService.updateTrack", () => {
  it("updates and returns the track", async () => {
    const track = makeTrack();
    const updated = makeTrack({ title: "New Title" });
    const repos = makeRepos({
      tracks: {
        findByTrackId: vi.fn(async () => track),
        update: vi.fn(async () => updated),
      },
    });
    const service = new TrackService(repos.tracks, repos.trackData, repos.stems, repos.stemData, repos.loops, repos.storage);
    const result = await service.updateTrack("track_abc", { title: "New Title" });
    expect(result).toEqual(updated);
    expect(repos.tracks.update).toHaveBeenCalledWith(track.id, { title: "New Title" });
  });

  it("throws NotFoundError when track not found", async () => {
    const repos = makeRepos({ tracks: { findByTrackId: vi.fn(async () => null) } });
    const service = new TrackService(repos.tracks, repos.trackData, repos.stems, repos.stemData, repos.loops, repos.storage);
    await expect(service.updateTrack("missing", {})).rejects.toThrow(NotFoundError);
  });
});

describe("TrackService.deleteTrack", () => {
  function makeDeleteService(overrides: {
    tracks?: Partial<ITrackRepository>;
    trackData?: Partial<ITrackDataRepository>;
    stems?: Partial<IStemsRepository>;
    stemData?: Partial<IStemDataRepository>;
    loops?: Partial<ILoopRepository>;
    storage?: Partial<IStorageService>;
    favorites?: Partial<IFavoritesRepository>;
    songs?: Partial<ISongRepository>;
  } = {}) {
    const repos = makeRepos(overrides);
    const favorites = makeFavorites(overrides.favorites);
    const songs = makeSongsRepo(overrides.songs);
    const loops: ILoopRepository = {
      ...repos.loops,
      deleteAllByTrackId: vi.fn(async () => {}),
      ...overrides.loops,
    } as ILoopRepository;
    return {
      service: new TrackService(repos.tracks, repos.trackData, repos.stems, repos.stemData, loops, repos.storage, favorites, songs),
      repos, favorites, songs, loops,
    };
  }

  it("throws NotFoundError when track not found", async () => {
    const { service } = makeDeleteService({ tracks: { findByTrackId: vi.fn(async () => null) } });
    await expect(service.deleteTrack("missing")).rejects.toThrow(NotFoundError);
  });

  it("deletes track with no associated data", async () => {
    const track = makeTrack();
    const { service, repos, favorites, loops } = makeDeleteService({
      tracks: { findByTrackId: vi.fn(async () => track), delete: vi.fn(async () => {}) },
      trackData: { findByTrackId: vi.fn(async () => null) },
      stems: { findByTrackId: vi.fn(async () => null) },
    });
    await service.deleteTrack("track_abc");
    expect(repos.tracks.delete).toHaveBeenCalledWith(track.id);
    expect(favorites.deleteByTrackId).toHaveBeenCalledWith("track_abc");
    expect(loops.deleteAllByTrackId).toHaveBeenCalledWith(track.id);
  });

  it("cleans up storage ids from trackData before deleting", async () => {
    const track = makeTrack();
    const data = makeTrackData({ coverImageStorageId: "cover_1", audioFileStorageId: "audio_1" });
    const { service, repos, songs } = makeDeleteService({
      tracks: { findByTrackId: vi.fn(async () => track), delete: vi.fn(async () => {}) },
      trackData: { findByTrackId: vi.fn(async () => data), delete: vi.fn(async () => {}) },
      stems: { findByTrackId: vi.fn(async () => null) },
    });
    await service.deleteTrack("track_abc");
    expect(repos.storage.delete).toHaveBeenCalledWith("cover_1");
    expect(repos.storage.delete).toHaveBeenCalledWith("audio_1");
    expect(songs.delete).toHaveBeenCalledWith(data.originalFilename);
    expect(repos.trackData.delete).toHaveBeenCalledWith(data.id);
  });

  it("cleans up stem storage and stem records before deleting", async () => {
    const track = makeTrack();
    const stemsRecord = makeStems();
    const stem = makeStemData({ stemAudioFileStorageId: "stem_audio_1" });
    const { service, repos } = makeDeleteService({
      tracks: { findByTrackId: vi.fn(async () => track), delete: vi.fn(async () => {}) },
      trackData: { findByTrackId: vi.fn(async () => null) },
      stems: { findByTrackId: vi.fn(async () => stemsRecord), delete: vi.fn(async () => {}) },
      stemData: { findByStemsId: vi.fn(async () => [stem]), delete: vi.fn(async () => {}) },
    });
    await service.deleteTrack("track_abc");
    expect(repos.storage.delete).toHaveBeenCalledWith("stem_audio_1");
    expect(repos.stemData.delete).toHaveBeenCalledWith(stem.id);
    expect(repos.stems.delete).toHaveBeenCalledWith(stemsRecord.id);
  });
});