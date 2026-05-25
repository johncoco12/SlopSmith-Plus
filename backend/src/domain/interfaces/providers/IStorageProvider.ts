export interface StoredItem {
  readonly identifier: string;
  readonly mimeType: string;
  readonly size: number;
}

export interface IStorageProvider {
  readonly name: string;
  store(identifier: string, data: Buffer): Promise<StoredItem>;
  storeFromPath(identifier: string, sourcePath: string): Promise<StoredItem>;
  get(identifier: string): Promise<Buffer | null>;
  exists(identifier: string): Promise<boolean>;
  delete(identifier: string): Promise<void>;
}