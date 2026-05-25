import type { Prisma } from "@prisma/client";
import type { Song as PrismaSong } from "@prisma/client";
import type {
  ISongRepository,
  SongInput,
} from "../../domain/repositories.js";
import type {
  ArtistAlbum,
  ArtistGroup,
  ArrangementMeta,
  LibraryQuery,
  LibraryStats,
  PageResult,
  SongMeta,
  TuningCount,
} from "../../domain/models/library.js";
import { prisma } from "./client.js";

function rowToMeta(row: PrismaSong, favorites: Set<string>, trackIdMap: Map<string, string>): SongMeta {
  return {
    filename: row.filename,
    trackId: trackIdMap.get(row.filename) ?? undefined,
    title: row.title,
    artist: row.artist,
    album: row.album,
    year: row.year,
    duration: row.duration,
    tuning: row.tuning,
    tuningName: row.tuningName,
    tuningSortKey: row.tuningSortKey,
    arrangements: row.arrangements as unknown as ArrangementMeta[],
    hasLyrics: row.hasLyrics,
    format: row.format as SongMeta["format"],
    stemCount: row.stemCount,
    stemIds: row.stemIds as unknown as string[],
    mtime: row.mtime,
    favorite: favorites.has(row.filename),
  };
}

function buildOrderBy(sort: LibraryQuery["sort"]): Record<string, string>[] {
  switch (sort) {
    case "title":       return [{ title: "asc" }, { artist: "asc" }];
    case "title-desc":  return [{ title: "desc" }, { artist: "asc" }];
    case "artist":      return [{ artist: "asc" }, { title: "asc" }];
    case "artist-desc": return [{ artist: "desc" }, { title: "asc" }];
    case "recent":      return [{ mtime: "desc" }];
    case "tuning":      return [{ tuningSortKey: "asc" }, { tuningName: "asc" }];
    case "year":        return [{ year: "asc" }, { artist: "asc" }];
    case "year-desc":   return [{ year: "desc" }, { artist: "asc" }];
  }
}

type WhereClause = Prisma.SongWhereInput;

function buildWhere(query: LibraryQuery, favorites: Set<string>): WhereClause {
  const and: WhereClause[] = [];

  if (query.q) {
    const q = query.q;
    and.push({
      OR: [
        { title: { contains: q } },
        { artist: { contains: q } },
        { album: { contains: q } },
      ],
    });
  }

  if (query.favoritesOnly) {
    and.push({ filename: { in: [...favorites] } });
  }

  if (query.format) {
    and.push({ format: query.format });
  }

  if (query.hasLyrics !== undefined) {
    and.push({ hasLyrics: query.hasLyrics });
  }

  if (query.tunings.length > 0) {
    and.push({ tuningName: { in: [...query.tunings] } });
  }

  return and.length > 0 ? { AND: and } : {};
}

function matchesPostFilters(row: PrismaSong, query: LibraryQuery): boolean {
  const arrNames: string[] = (
    row.arrangements as unknown as ArrangementMeta[]
  ).map((a) => a.name.toLowerCase());
  const stemIds: string[] = row.stemIds as unknown as string[];

  for (const name of query.arrangementsHas) {
    if (!arrNames.some((a) => a.includes(name.toLowerCase()))) return false;
  }
  for (const name of query.arrangementsLacks) {
    if (arrNames.some((a) => a.includes(name.toLowerCase()))) return false;
  }
  for (const id of query.stemsHas) {
    if (!stemIds.includes(id)) return false;
  }
  for (const id of query.stemsLacks) {
    if (stemIds.includes(id)) return false;
  }
  return true;
}

const hasPostFilters = (q: LibraryQuery) =>
  q.arrangementsHas.length > 0 ||
  q.arrangementsLacks.length > 0 ||
  q.stemsHas.length > 0 ||
  q.stemsLacks.length > 0;

export class SongRepository implements ISongRepository {
  private async getFavorites(): Promise<Set<string>> {
    const rows = await prisma.favorite.findMany({ select: { trackId: true } });
    return new Set(rows.map((r) => r.trackId));
  }

  private async getTrackIdMap(filenames: string[]): Promise<Map<string, string>> {
    const rows = await prisma.trackData.findMany({
      where: { originalFilename: { in: filenames } },
      select: { originalFilename: true, track: { select: { trackId: true } } },
    });
    return new Map(rows.map((r) => [r.originalFilename, r.track.trackId]));
  }

  async search(query: LibraryQuery): Promise<PageResult<SongMeta>> {
    const favorites = await this.getFavorites();
    const where = buildWhere(query, favorites);
    const orderBy = buildOrderBy(query.sort);
    const skip = (query.page - 1) * query.size;

    const [rows, total] = await Promise.all([
      prisma.song.findMany({ where, orderBy }),
      prisma.song.count({ where }),
    ]);

    const filtered = hasPostFilters(query)
      ? rows.filter((r) => matchesPostFilters(r, query))
      : rows;

    const page = filtered.slice(skip, skip + query.size);
    const trackIdMap = await this.getTrackIdMap(page.map((r) => r.filename));

    return {
      items: page.map((r) => rowToMeta(r, favorites, trackIdMap)),
      total: hasPostFilters(query) ? filtered.length : total,
      page: query.page,
      size: query.size,
    };
  }

  async artists(opts: {
    q?: string;
    letter?: string;
    page: number;
    size: number;
    favoritesOnly: boolean;
  }): Promise<PageResult<ArtistGroup>> {
    const favorites = await this.getFavorites();
    const and: WhereClause[] = [];

    if (opts.letter && opts.letter !== "#") {
      and.push({ artist: { startsWith: opts.letter } });
    }
    if (opts.q) {
      and.push({ artist: { contains: opts.q } });
    }
    if (opts.favoritesOnly) {
      and.push({ filename: { in: [...favorites] } });
    }

    const rows = await prisma.song.findMany({
      where: and.length > 0 ? { AND: and } : undefined,
      orderBy: [{ artist: "asc" }, { album: "asc" }, { title: "asc" }],
    });

    const trackIdMap = await this.getTrackIdMap(rows.map((r) => r.filename));

    // Group by artist → album
    const artistMap = new Map<string, Map<string, SongMeta[]>>();
    for (const row of rows) {
      const meta = rowToMeta(row, favorites, trackIdMap);
      if (!artistMap.has(meta.artist)) artistMap.set(meta.artist, new Map());
      const albumMap = artistMap.get(meta.artist)!;
      if (!albumMap.has(meta.album)) albumMap.set(meta.album, []);
      albumMap.get(meta.album)!.push(meta);
    }

    const allArtists: ArtistGroup[] = [...artistMap.entries()].map(
      ([name, albums]): ArtistGroup => ({
        name,
        albums: [...albums.entries()].map(
          ([albumName, songs]): ArtistAlbum => ({ name: albumName, songs })
        ),
      })
    );

    const total = allArtists.length;
    const skip = (opts.page - 1) * opts.size;

    return {
      items: allArtists.slice(skip, skip + opts.size),
      total,
      page: opts.page,
      size: opts.size,
    };
  }

  async stats(): Promise<LibraryStats> {
    const [totalSongs, artistRows, songRows] = await Promise.all([
      prisma.song.count(),
      prisma.song.findMany({ select: { artist: true }, distinct: ["artist"] }),
      prisma.song.findMany({ select: { artist: true } }),
    ]);

    const letters: Record<string, number> = {};
    for (const { artist } of songRows) {
      const first = artist[0]?.toUpperCase() ?? "";
      const key = /[A-Z]/.test(first) ? first : "#";
      letters[key] = (letters[key] ?? 0) + 1;
    }

    return { totalSongs, totalArtists: artistRows.length, letters };
  }

  async tuningNames(): Promise<TuningCount[]> {
    const rows = await prisma.song.groupBy({
      by: ["tuningName"],
      _count: { tuningName: true },
      orderBy: { _count: { tuningName: "desc" } },
    });
    return rows.map((r) => ({ name: r.tuningName, count: r._count.tuningName }));
  }

  async findByFilename(filename: string): Promise<SongMeta | null> {
    const row = await prisma.song.findUnique({ where: { filename } });
    if (!row) return null;
    const favorites = await this.getFavorites();
    const trackIdMap = await this.getTrackIdMap([row.filename]);
    return rowToMeta(row, favorites, trackIdMap);
  }

  async findCached(filename: string, mtime: number, size: number): Promise<SongMeta | null> {
    const row = await prisma.song.findUnique({ where: { filename } });
    if (!row || row.mtime !== mtime || row.size !== size) return null;
    const favorites = await this.getFavorites();
    const trackIdMap = await this.getTrackIdMap([row.filename]);
    return rowToMeta(row, favorites, trackIdMap);
  }

  async upsert(filename: string, input: SongInput): Promise<void> {
    const data = {
      mtime: input.mtime,
      size: input.size,
      title: input.title,
      artist: input.artist,
      album: input.album,
      year: input.year,
      duration: input.duration,
      tuning: input.tuning,
      tuningName: input.tuningName,
      tuningSortKey: input.tuningSortKey,
      arrangements: input.arrangements as unknown as Prisma.InputJsonValue,
      hasLyrics: input.hasLyrics,
      format: input.format,
      stemCount: input.stemCount,
      stemIds: input.stemIds as unknown as Prisma.InputJsonValue,
    };

    await prisma.song.upsert({
      where: { filename },
      update: data,
      create: { filename, ...data },
    });
  }

  async delete(filename: string): Promise<void> {
    await prisma.song.delete({ where: { filename } }).catch(() => undefined);
  }

  async deleteStale(keepFilenames: Set<string>): Promise<number> {
    const existing = await prisma.song.findMany({ select: { filename: true } });
    const toDelete = existing
      .map((r) => r.filename)
      .filter((f) => !keepFilenames.has(f));

    if (toDelete.length > 0) {
      await prisma.song.deleteMany({ where: { filename: { in: toDelete } } });
    }
    return toDelete.length;
  }
}
