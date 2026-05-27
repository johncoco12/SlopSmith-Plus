import { container, DependencyContainer } from "tsyringe";
import { config } from "./config.js";
import { MinIOProvider } from "./infrastructure/provider/storage/MinIOProvider.js";
import { ProfileRepository } from "./infrastructure/db/ProfileRepository.js";
import { PermissionGroupRepository } from "./infrastructure/db/PermissionGroupRepository.js";
import { StorageService } from "./services/StorageService.js";
import { ProfileService } from "./services/ProfileService.js";
import { PermissionsService } from "./services/PermissionsService.js";
import { TrackRepository } from "./infrastructure/db/TrackRepository.js";
import { TrackDataRepository } from "./infrastructure/db/TrackDataRepository.js";
import { StemsRepository } from "./infrastructure/db/StemsRepository.js";
import { StemDataRepository } from "./infrastructure/db/StemDataRepository.js";
import { LoopRepository } from "./infrastructure/db/LoopRepository.js";
import { TrackScoreRepository } from "./infrastructure/db/TrackScoreRepository.js";
import type { ITrackScoreRepository } from "./infrastructure/db/TrackScoreRepository.js";
import {
  IStorageProviderToken,
  IStorageServiceToken,
  IProfileServiceToken,
  IPermissionsServiceToken,
  IProfileRepositoryToken,
  IPermissionGroupRepositoryToken,
  ITrackRepositoryToken,
  ITrackDataRepositoryToken,
  IStemsRepositoryToken,
  IStemDataRepositoryToken,
  ILoopRepositoryToken,
  ITrackScoreRepositoryToken,
} from "./tokens.js";
import type { IStorageProvider } from "./domain/interfaces/providers/IStorageProvider.js";
import type { IStorageService } from "./domain/interfaces/services/IStorageService.js";
import type { IProfileService } from "./domain/interfaces/services/IProfileService.js";
import type { IPermissionsService } from "./domain/interfaces/services/IPermissionsService.js";
import type { IProfileRepository } from "./domain/repositories.js";
import type { IPermissionGroupRepository } from "./domain/repositories.js";
import type { ITrackRepository, ITrackDataRepository, IStemsRepository, IStemDataRepository, ILoopRepository } from "./domain/repositories.js";

export {
  IStorageProviderToken,
  IStorageServiceToken,
  IProfileServiceToken,
  IPermissionsServiceToken,
  IProfileRepositoryToken,
  IPermissionGroupRepositoryToken,
  ITrackRepositoryToken,
  ITrackDataRepositoryToken,
  IStemsRepositoryToken,
  IStemDataRepositoryToken,
  ILoopRepositoryToken,
  ITrackScoreRepositoryToken,
};

export function registerContainer(): DependencyContainer {
  // Storage
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

  // Repositories
  container.register<IProfileRepository>(IProfileRepositoryToken, {
    useFactory: () => new ProfileRepository(),
  });
  container.register<IPermissionGroupRepository>(IPermissionGroupRepositoryToken, {
    useFactory: () => new PermissionGroupRepository(),
  });
  container.register<ITrackRepository>(ITrackRepositoryToken, {
    useFactory: () => new TrackRepository(),
  });
  container.register<ITrackDataRepository>(ITrackDataRepositoryToken, {
    useFactory: () => new TrackDataRepository(),
  });
  container.register<IStemsRepository>(IStemsRepositoryToken, {
    useFactory: () => new StemsRepository(),
  });
  container.register<IStemDataRepository>(IStemDataRepositoryToken, {
    useFactory: () => new StemDataRepository(),
  });
  container.register<ILoopRepository>(ILoopRepositoryToken, {
    useFactory: () => new LoopRepository(),
  });
  container.register<ITrackScoreRepository>(ITrackScoreRepositoryToken, {
    useFactory: () => new TrackScoreRepository(),
  });

  // Services
  container.register<IProfileService>(IProfileServiceToken, {
    useFactory: (c) => new ProfileService(c.resolve(IProfileRepositoryToken)),
  });
  container.register<IPermissionsService>(IPermissionsServiceToken, {
    useFactory: (c) => new PermissionsService(c.resolve(IPermissionGroupRepositoryToken)),
  });

  return container;
}