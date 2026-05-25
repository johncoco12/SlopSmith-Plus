import { randomUUID, createHash } from "node:crypto";
import type { IProfileRepository } from "../domain/repositories.js";
import type { Profile, CreateProfileInput, UpdateProfileInput } from "../domain/models/profile.js";
import type { IProfileService, SafeProfile, Session } from "../domain/interfaces/services/IProfileService.js";
import { InvalidCredentialsError, AccountLockedError, NotFoundError } from "../domain/errors.js";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000;

function hashPin(pin: string, salt: string): string {
  return createHash("sha256").update(salt + pin).digest("hex");
}

function sanitizeProfile(profile: Profile): SafeProfile {
  const { pinCode, pinSalt, recoveryPhrase, recoveryPhraseSalt, ...safe } = profile;
  return safe;
}

export class ProfileService implements IProfileService {
  private sessions = new Map<string, Session>();
  private failedAttempts = new Map<number, { count: number; lockedUntil: number | null }>();

  constructor(private readonly profiles: IProfileRepository) {}

  async listProfiles(): Promise<SafeProfile[]> {
    const all = await this.profiles.findAll();
    return all.map(sanitizeProfile);
  }

  async getProfile(id: number): Promise<SafeProfile> {
    const profile = await this.profiles.findById(id);
    if (!profile) throw new NotFoundError("Profile");
    return sanitizeProfile(profile);
  }

  async createProfile(input: CreateProfileInput): Promise<SafeProfile> {
    const existing = await this.profiles.findByName(input.name);
    if (existing) throw new InvalidCredentialsError("Profile name already exists");
    const profile = await this.profiles.create(input);
    return sanitizeProfile(profile);
  }

  async updateProfile(id: number, input: UpdateProfileInput): Promise<SafeProfile> {
    const profile = await this.profiles.findById(id);
    if (!profile) throw new NotFoundError("Profile");
    const updated = await this.profiles.update(id, input);
    return sanitizeProfile(updated);
  }

  async deleteProfile(id: number): Promise<void> {
    await this.profiles.delete(id);
    for (const [token, session] of this.sessions) {
      if (session.profileId === id) this.sessions.delete(token);
    }
  }

  async login(name: string, pin: string): Promise<{ session: Session; profile: SafeProfile }> {
    const profile = await this.profiles.findByName(name);
    if (!profile) throw new InvalidCredentialsError("Invalid profile name or PIN");

    if (profile.locked) throw new AccountLockedError();

    const attempts = this.failedAttempts.get(profile.id);
    if (attempts?.lockedUntil && Date.now() < attempts.lockedUntil) {
      throw new AccountLockedError();
    }

    const hashed = hashPin(pin, profile.pinSalt);
    if (hashed !== profile.pinCode) {
      const current = this.failedAttempts.get(profile.id) ?? { count: 0, lockedUntil: null };
      current.count += 1;
      if (current.count >= MAX_FAILED_ATTEMPTS) {
        current.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
      }
      this.failedAttempts.set(profile.id, current);
      throw new InvalidCredentialsError("Invalid profile name or PIN");
    }

    this.failedAttempts.delete(profile.id);

    const token = randomUUID();
    const now = Date.now();
    const session: Session = {
      token,
      profileId: profile.id,
      profileName: profile.name,
      createdAt: now,
      expiresAt: now + SESSION_TTL_MS,
    };
    this.sessions.set(token, session);

    return { session, profile: sanitizeProfile(profile) };
  }

  async recoverProfile(name: string, recoveryPhrase: string, newPin: string): Promise<SafeProfile> {
    const profile = await this.profiles.findByName(name);
    if (!profile) throw new NotFoundError("Profile");

    const hashed = hashPin(recoveryPhrase, profile.recoveryPhraseSalt);
    if (hashed !== profile.recoveryPhrase) {
      throw new InvalidCredentialsError("Invalid recovery phrase");
    }

    const updated = await this.profiles.update(profile.id, {
      pinCode: newPin,
      locked: false,
    });

    this.failedAttempts.delete(profile.id);
    return sanitizeProfile(updated);
  }

  validateSession(token: string): Session | null {
    const session = this.sessions.get(token);
    if (!session) return null;
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(token);
      return null;
    }
    return session;
  }

  logout(token: string): void {
    this.sessions.delete(token);
  }

  async getPermissions(profileId: number): Promise<string[]> {
    const profile = await this.profiles.findById(profileId);
    if (!profile) return [];
    const settings = profile.profileSettings as Record<string, unknown> | null;
    if (!settings || !Array.isArray(settings.permissions)) return [];
    return settings.permissions as string[];
  }

  async isSetup(): Promise<boolean> {
    const profiles = await this.profiles.findAll();
    return profiles.length > 0;
  }
}