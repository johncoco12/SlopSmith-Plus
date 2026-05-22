import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import type { IProfileRepository } from "../../domain/repositories.js";
import type { Profile, CreateProfileInput, UpdateProfileInput } from "../../domain/models/profile.js";
import { prisma } from "./client.js";

function hashPin(pin: string, salt: string): string {
  return createHash("sha256").update(salt + pin).digest("hex");
}

function generateSalt(): string {
  return randomUUID();
}

function rowToProfile(row: {
  id: number;
  name: string;
  avatarId: number | null;
  pinCode: string;
  pinSalt: string;
  recoveryPhrase: string;
  recoveryPhraseSalt: string;
  recoveryPhraseHint: string;
  locked: boolean;
  profileSettings: unknown;
  createdAt: Date;
  updatedAt: Date;
}): Profile {
  return {
    id: row.id,
    name: row.name,
    avatarId: row.avatarId,
    pinCode: row.pinCode,
    pinSalt: row.pinSalt,
    recoveryPhrase: row.recoveryPhrase,
    recoveryPhraseSalt: row.recoveryPhraseSalt,
    recoveryPhraseHint: row.recoveryPhraseHint,
    locked: row.locked,
    profileSettings: row.profileSettings as Record<string, unknown>,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class ProfileRepository implements IProfileRepository {
  async findById(id: number): Promise<Profile | null> {
    const row = await prisma.profile.findUnique({ where: { id } });
    return row ? rowToProfile(row) : null;
  }

  async findByName(name: string): Promise<Profile | null> {
    const row = await prisma.profile.findFirst({ where: { name: { mode: "insensitive", equals: name } } });
    return row ? rowToProfile(row) : null;
  }

  async findAll(): Promise<Profile[]> {
    const rows = await prisma.profile.findMany({ orderBy: { id: "asc" } });
    return rows.map(rowToProfile);
  }

  async create(input: CreateProfileInput): Promise<Profile> {
    const salt = generateSalt();
    const hashedPin = hashPin(input.pinCode, salt);
    const recoverySalt = generateSalt();
    const hashedRecovery = hashPin(input.recoveryPhrase, recoverySalt);

    const row = await prisma.profile.create({
      data: {
        name: input.name,
        pinCode: hashedPin,
        pinSalt: salt,
        recoveryPhrase: hashedRecovery,
        recoveryPhraseSalt: recoverySalt,
        recoveryPhraseHint: input.recoveryPhraseHint,
        avatarId: input.avatarId ?? null,
      },
    });
    return rowToProfile(row);
  }

  async update(id: number, input: UpdateProfileInput): Promise<Profile> {
    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.avatarId !== undefined) data.avatarId = input.avatarId;
    if (input.locked !== undefined) data.locked = input.locked;
    if (input.profileSettings !== undefined) data.profileSettings = input.profileSettings;
    if (input.pinCode !== undefined) {
      const salt = generateSalt();
      data.pinCode = hashPin(input.pinCode, salt);
      data.pinSalt = salt;
    }

    const row = await prisma.profile.update({ where: { id }, data });
    return rowToProfile(row);
  }

  async delete(id: number): Promise<void> {
    await prisma.profile.delete({ where: { id } }).catch(() => undefined);
  }
}