import "reflect-metadata";
import { container, DependencyContainer } from "tsyringe";
import { config } from "./config.js";
import { MinIOProvider } from "./infrastructure/provider/storage/MinIOProvider.js";
import type { IStorageProvider } from "./domain/interfaces/providers/IStorageProvider.js";
import type { IStorageService } from "./domain/interfaces/services/IStorageService.js";
import { StorageService } from "./services/StorageService.js";

const IStorageProviderToken = Symbol("IStorageProvider");
const IStorageServiceToken = Symbol("IStorageService");

export { IStorageProviderToken, IStorageServiceToken };

export function registerContainer(): DependencyContainer {
  container.register<IStorageProvider>(IStorageProviderToken, {
    useFactory: () =>
      new MinIOProvider({
        endPoint: config.minioEndpoint ?? "localhost",
        port: config.minioPort,
        accessKey: config.minioAccessKey,
        secretKey: config.minioSecretKey,
        bucket: config.minioBucket,
        useSSL: config.minioUseSSL,
      }),
  });

  container.register<IStorageService>(IStorageServiceToken, {
    useFactory: (c) => new StorageService(c.resolve(IStorageProviderToken)),
  });

  return container;
}