import * as Minio from "minio";
import { S3Error } from "minio";
import fs from "node:fs";
import { mimeFromFile } from "../../../utils/mime.js";
import type { IStorageProvider, StoredItem } from "../../../domain/interfaces/providers/IStorageProvider.js";

export interface MinIOProviderOptions {
  readonly endPoint: string;
  readonly port?: number;
  readonly accessKey?: string;
  readonly secretKey?: string;
  readonly bucket?: string;
  readonly useSSL?: boolean;
}

export class MinIOProvider implements IStorageProvider {
  readonly name = "MinIO";
  private readonly client: Minio.Client;
  private readonly bucket: string;
  private bucketReady = false;

  constructor(opts: MinIOProviderOptions) {
    this.bucket = opts.bucket ?? "slopsmith";
    this.client = new Minio.Client({
      endPoint: opts.endPoint,
      port: opts.port,
      accessKey: opts.accessKey ?? "",
      secretKey: opts.secretKey ?? "",
      useSSL: opts.useSSL ?? false,
    });
  }

  private async ensureBucket(): Promise<void> {
    if (this.bucketReady) return;
    const exists = await this.client.bucketExists(this.bucket);
    if (!exists) {
      await this.client.makeBucket(this.bucket);
    }
    this.bucketReady = true;
  }

  async store(identifier: string, data: Buffer): Promise<StoredItem> {
    await this.ensureBucket();
    const mimeType = mimeFromFile(identifier);
    await this.client.putObject(this.bucket, identifier, data, data.length, {
      "Content-Type": mimeType,
    });
    return { identifier, mimeType, size: data.length };
  }

  async storeFromPath(identifier: string, sourcePath: string): Promise<StoredItem> {
    await this.ensureBucket();
    const mimeType = mimeFromFile(identifier);
    const stat = fs.statSync(sourcePath);
    await this.client.fPutObject(this.bucket, identifier, sourcePath, {
      "Content-Type": mimeType,
    });
    return { identifier, mimeType, size: stat.size };
  }

  async get(identifier: string): Promise<Buffer | null> {
    await this.ensureBucket();
    try {
      const stream = await this.client.getObject(this.bucket, identifier);
      return await streamToBuffer(stream);
    } catch (err: unknown) {
      if (isNoSuchKeyError(err)) return null;
      throw err;
    }
  }

  async delete(identifier: string): Promise<void> {
    await this.ensureBucket();
    await this.client.removeObject(this.bucket, identifier);
  }

  async exists(identifier: string): Promise<boolean> {
    await this.ensureBucket();
    try {
      await this.client.statObject(this.bucket, identifier);
      return true;
    } catch (err: unknown) {
      if (isNoSuchKeyError(err)) return false;
      throw err;
    }
  }
}

function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

function isNoSuchKeyError(err: unknown): boolean {
  if (err instanceof S3Error && err.code === "NoSuchKey") return true;
  if (err instanceof Error) {
    if ("code" in err && (err as { code: string }).code === "NoSuchKey") return true;
    if (err.message?.includes("The specified key does not exist")) return true;
  }
  return false;
}