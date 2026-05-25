import type { CreateProfileInput, UpdateProfileInput } from "../../models/profile.js";

export interface SafeProfile {
  readonly id: number;
  readonly name: string;
  readonly avatarId: number | null;
  readonly locked: boolean;
  readonly profileSettings: Record<string, unknown>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface Session {
  readonly token: string;
  readonly profileId: number;
  readonly profileName: string;
  readonly createdAt: number;
  readonly expiresAt: number;
}

export interface IProfileService {
  listProfiles(): Promise<SafeProfile[]>;
  getProfile(id: number): Promise<SafeProfile>;
  createProfile(input: CreateProfileInput): Promise<SafeProfile>;
  updateProfile(id: number, input: UpdateProfileInput): Promise<SafeProfile>;
  deleteProfile(id: number): Promise<void>;
  login(name: string, pin: string): Promise<{ session: Session; profile: SafeProfile }>;
  recoverProfile(name: string, recoveryPhrase: string, newPin: string): Promise<SafeProfile>;
  validateSession(token: string): Session | null;
  logout(token: string): void;
  getPermissions(profileId: number): Promise<string[]>;
  isSetup(): Promise<boolean>;
}