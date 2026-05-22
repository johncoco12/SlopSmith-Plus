import type { ITrackRepository } from "../../domain/repositories.js";
import type { Track, CreateTrackInput, UpdateTrackInput } from "../../domain/models/track.js";
import { NotFoundError } from "../../domain/errors.js";
import { prisma } from "./client.js";

function rowToTrack(row: {
  id: number;
  trackId: string;
  artist: string;
  title: string;
  album: string;
  year: string;
  duration: number;
  tuning: string;
  hasLyrics: boolean;
  format: string;
  tuningName: string;
  tuningSortKey: number;
  createdAt: Date;
  modifiedAt: Date;
  trackData?: unknown | null;
  stems?: unknown | null;
}): Track {
  return {
    id: row.id,
    trackId: row.trackId,
    artist: row.artist,
    title: row.title,
    album: row.album,
    year: row.year,
    duration: row.duration,
    tuning: row.tuning,
    hasLyrics: row.hasLyrics,
    format: row.format as Track["format"],
    tuningName: row.tuningName,
    tuningSortKey: row.tuningSortKey,
    trackData: null,
    stems: null,
    createdAt: row.createdAt,
    modifiedAt: row.modifiedAt,
  };
}

export class TrackRepository implements ITrackRepository {
  async findById(id: number): Promise<Track | null> {
    const row = await prisma.track.findUnique({ where: { id } });
    return row ? rowToTrack(row) : null;
  }

  async findByTrackId(trackId: string): Promise<Track | null> {
    const row = await prisma.track.findUnique({ where: { trackId } });
    return row ? rowToTrack(row) : null;
  }

  async findAll(): Promise<Track[]> {
    const rows = await prisma.track.findMany({ orderBy: { id: "asc" } });
    return rows.map(rowToTrack);
  }

  async create(input: CreateTrackInput): Promise<Track> {
    const row = await prisma.track.create({
      data: {
        trackId: input.trackId,
        artist: input.artist ?? "",
        title: input.title ?? "",
        album: input.album ?? "",
        year: input.year ?? "",
        duration: input.duration ?? 0,
        tuning: input.tuning ?? "",
        hasLyrics: input.hasLyrics ?? false,
        format: input.format ?? "psarc",
        tuningName: input.tuningName ?? "",
        tuningSortKey: input.tuningSortKey ?? 0,
      },
    });
    return rowToTrack(row);
  }

  async update(id: number, input: UpdateTrackInput): Promise<Track> {
    const data: Record<string, unknown> = {};
    if (input.trackId !== undefined) data.trackId = input.trackId;
    if (input.artist !== undefined) data.artist = input.artist;
    if (input.title !== undefined) data.title = input.title;
    if (input.album !== undefined) data.album = input.album;
    if (input.year !== undefined) data.year = input.year;
    if (input.duration !== undefined) data.duration = input.duration;
    if (input.tuning !== undefined) data.tuning = input.tuning;
    if (input.hasLyrics !== undefined) data.hasLyrics = input.hasLyrics;
    if (input.format !== undefined) data.format = input.format;
    if (input.tuningName !== undefined) data.tuningName = input.tuningName;
    if (input.tuningSortKey !== undefined) data.tuningSortKey = input.tuningSortKey;

    const row = await prisma.track.update({ where: { id }, data });
    return rowToTrack(row);
  }

  async delete(id: number): Promise<void> {
    try {
      await prisma.track.delete({ where: { id } });
    } catch {
      throw new NotFoundError("Track");
    }
  }
}