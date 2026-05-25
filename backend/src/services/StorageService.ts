import type { IStorageProvider, StoredItem } from "../domain/interfaces/providers/IStorageProvider.js";
import type { IStorageService } from "../domain/interfaces/services/IStorageService.js";

export class StorageService implements IStorageService {
  constructor(private readonly provider: IStorageProvider) {}

  store(identifier: string, data: Buffer): Promise<StoredItem> {
    return this.provider.store(identifier, data);
  }

  storeFromPath(identifier: string, sourcePath: string): Promise<StoredItem> {
    return this.provider.storeFromPath(identifier, sourcePath);
  }

  get(identifier: string): Promise<Buffer | null> {
    return this.provider.get(identifier);
  }

  delete(identifier: string): Promise<void> {
    return this.provider.delete(identifier);
  }

  exists(identifier: string): Promise<boolean> {
    return this.provider.exists(identifier);
  }
}