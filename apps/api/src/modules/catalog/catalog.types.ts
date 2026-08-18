export interface CatalogMovie {
  id: number
  title: string
  overview: string
  posterPath: string | null
  backdropPath: string | null
  releaseDate: string | null
}

export interface CatalogMovieDetails extends CatalogMovie {
  runtimeMinutes: number | null
}

export interface MovieCatalog {
  listNowPlaying(): Promise<CatalogMovie[]>
  searchMovies(query: string): Promise<CatalogMovie[]>
  getMovieDetails(tmdbMovieId: number): Promise<CatalogMovieDetails>
}
