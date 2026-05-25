export interface Profile {
  readonly id: number;
  readonly name: string;
  readonly avatarId: number | null;
  readonly pinCode: string;
  readonly pinSalt: string;
  readonly recoveryPhrase: string;
  readonly recoveryPhraseSalt: string;
  readonly recoveryPhraseHint: string;
  readonly locked: boolean;
  readonly profileSettings: Record<string, unknown>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateProfileInput {
  readonly name: string;
  readonly pinCode: string;
  readonly recoveryPhrase: string;
  readonly recoveryPhraseHint: string;
  readonly avatarId?: number;
}

export interface UpdateProfileInput {
  readonly name?: string;
  readonly avatarId?: number | null;
  readonly pinCode?: string;
  readonly locked?: boolean;
  readonly profileSettings?: Record<string, unknown>;
}