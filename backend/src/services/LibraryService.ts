import type {
  ISongRepository,
  IFavoritesRepository,
} from "../domain/repositories.js";
import type {
  ArtistGroup,
  LibraryQuery,
  LibraryStats,
  PageResult,
  SongMeta,
  TuningCount,
} from "../domain/models/library.js";

export class LibraryService {
  constructor(
    private readonly songs: ISongRepository,
    private readonly favorites: IFavoritesRepository,
  ) {}

  search(query: LibraryQuery): Promise<PageResult<SongMeta>> {
    return this.songs.search(query);
  }

  artists(opts: {
    q?: string;
    letter?: string;
    page: number;
    size: number;
    favoritesOnly: boolean;
  }): Promise<PageResult<ArtistGroup>> {
    return this.songs.artists(opts);
  }

  stats(): Promise<LibraryStats> {
    return this.songs.stats();
  }

  tuningNames(): Promise<TuningCount[]> {
    return this.songs.tuningNames();
  }

  toggleFavorite(filename: string): Promise<boolean> {
    return this.favorites.toggle(filename);
  }
}
