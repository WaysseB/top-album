import { decadeOf, NO_DECADE, type Album } from "@/lib/albums"

export type Tally = {
  /** Cle de regroupement, insensible a la casse et aux accents. */
  key: string
  /** Libelle affiche, dans l'orthographe la plus frequente. */
  label: string
  count: number
}

export type Completeness = {
  label: string
  filled: number
}

export type AlbumStats = {
  total: number
  artists: Tally[]
  genres: Tally[]
  years: Tally[]
  decades: Tally[]
  /** Nombre d'artistes distincts, et part representee par le premier. */
  distinctArtists: number
  completeness: Completeness[]
}

/** Repli des accents et de la casse : « Bjork » et « Björk » sont le meme artiste. */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
}

/**
 * Regroupe des libelles sur leur forme repliee, en gardant l'orthographe la
 * plus frequente — a egalite, la premiere rencontree.
 */
function group(values: string[]): Tally[] {
  const buckets = new Map<string, { count: number; labels: Map<string, number> }>()

  for (const raw of values) {
    const value = raw.trim()
    if (!value) continue

    const key = fold(value)
    const bucket = buckets.get(key) ?? { count: 0, labels: new Map<string, number>() }
    bucket.count += 1
    bucket.labels.set(value, (bucket.labels.get(value) ?? 0) + 1)
    buckets.set(key, bucket)
  }

  return [...buckets.entries()]
    .map(([key, { count, labels }]) => {
      const label = [...labels.entries()].sort((a, b) => b[1] - a[1])[0][0]
      return { key, label, count }
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "fr"))
}

export function computeStats(albums: Album[]): AlbumStats {
  const artists = group(albums.map((a) => a.artist))
  const genres = group(albums.flatMap((a) => a.genres))

  // Les annees se trient chronologiquement, pas par frequence : le classement
  // par nombre est fait a l'affichage, la frise a besoin de l'ordre naturel.
  const years = group(albums.map((a) => a.year)).sort((a, b) => a.label.localeCompare(b.label))

  const decades = group(
    albums.map((a) => {
      const decade = decadeOf(a.year)
      return decade === null ? NO_DECADE : String(decade)
    }),
  ).sort((a, b) => {
    // « Sans annee » ferme la marche.
    if (a.key === NO_DECADE) return 1
    if (b.key === NO_DECADE) return -1
    return Number(a.key) - Number(b.key)
  })

  const count = (predicate: (album: Album) => boolean) => albums.filter(predicate).length

  return {
    total: albums.length,
    artists,
    genres,
    years,
    decades,
    distinctArtists: artists.length,
    // Sert de tableau de bord de saisie : ce qu'il reste a completer a la main.
    completeness: [
      { label: "Pochette", filled: count((a) => Boolean(a.cover)) },
      { label: "Année", filled: count((a) => Boolean(a.year)) },
      { label: "Genres", filled: count((a) => a.genres.length > 0) },
      { label: "Titre préféré", filled: count((a) => Boolean(a.favoriteTrack)) },
      { label: "Deezer", filled: count((a) => Boolean(a.deezerUrl)) },
      { label: "Spotify", filled: count((a) => Boolean(a.spotifyUrl)) },
      { label: "Apple Music", filled: count((a) => Boolean(a.appleMusicUrl)) },
    ],
  }
}
