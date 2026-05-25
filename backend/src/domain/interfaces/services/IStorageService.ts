import type { StoredItem } from "../providers/IStorageProvider.js";

export type { StoredItem };

export interface IStorageService {
  store(identifier: string, data: Buffer): Promise<StoredItem>;
  storeFromPath(identifier: string, sourcePath: string): Promise<StoredItem>;
  get(identifier: string): Promise<Buffer | null>;
  delete(identifier: string): Promise<void>;
  exists(identifier: string): Promise<boolean>;
}