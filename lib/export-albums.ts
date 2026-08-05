import type { Album, AlbumList } from "@/lib/albums"

export type AlbumExportEntry = {
  rank: number
  id: string
  title: string
  artist: string
  year: string
  cover: string
  note: string | null
  favoriteTrack: string | null
  deezerUrl: string | null
}

export type AlbumsExport = {
  title: string
  list: AlbumList | null
  exportedAt: string
  count: number
  albums: AlbumExportEntry[]
}

export function exportFilename(list: AlbumList): string {
  return list === "wannabe" ? "mes-albums-wannabe.json" : "mon-top-albums.json"
}

/**
 * Represente une liste sous une forme JSON stable et lisible.
 * `rank` est derive de l'ordre du tableau : c'est la position affichee.
 */
export function buildAlbumsExport(albums: Album[], title = "Mon Top Albums"): AlbumsExport {
  return {
    title,
    list: albums[0]?.list ?? null,
    exportedAt: new Date().toISOString(),
    count: albums.length,
    albums: albums.map((album, index) => ({
      rank: index + 1,
      id: album.id,
      title: album.title,
      artist: album.artist,
      year: album.year,
      cover: album.cover,
      note: album.note ?? null,
      favoriteTrack: album.favoriteTrack ?? null,
      deezerUrl: album.deezerUrl ?? null,
    })),
  }
}
