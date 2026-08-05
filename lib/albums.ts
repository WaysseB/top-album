/** Les deux classements : le top assume, et la liste d'attente. */
export type AlbumList = "top" | "wannabe"

export const ALBUM_LISTS: AlbumList[] = ["top", "wannabe"]

export const LIST_LABELS: Record<AlbumList, string> = {
  top: "Mon Top Albums",
  wannabe: "Wannabe",
}

/** Libelle court, pour les onglets. */
export const LIST_TAB_LABELS: Record<AlbumList, string> = {
  top: "Top",
  wannabe: "Wannabe",
}

export const LIST_PATHS: Record<AlbumList, string> = {
  top: "/",
  wannabe: "/wannabe",
}

export type ListCounts = Record<AlbumList, number>

export type Album = {
  id: string
  list: AlbumList
  title: string
  artist: string
  year: string
  cover: string
  note?: string
  favoriteTrack?: string
  /** Lecteur integre dans la fiche. */
  deezerUrl?: string
  /** Simples liens de redirection. */
  spotifyUrl?: string
  appleMusicUrl?: string
  /** Pre-rempli depuis Deezer par un script, corrigeable dans le formulaire. */
  genres: string[]
}

/** Un album tel que saisi dans le formulaire : sans id, celui-ci est genere en base. */
export type AlbumInput = Omit<Album, "id">

/** Une ligne de la table `public.albums`. */
export type AlbumRow = {
  id: string
  list: string
  title: string
  artist: string | null
  year: string | null
  cover: string | null
  note: string | null
  favorite_track: string | null
  deezer_url: string | null
  spotify_url: string | null
  apple_music_url: string | null
  genres: string[] | null
  position: number
}

export const ALBUM_COLUMNS =
  "id, list, title, artist, year, cover, note, favorite_track, deezer_url, spotify_url, apple_music_url, genres, position"

export function rowToAlbum(row: AlbumRow): Album {
  return {
    id: row.id,
    list: row.list === "wannabe" ? "wannabe" : "top",
    title: row.title,
    artist: row.artist ?? "",
    year: row.year ?? "",
    cover: row.cover ?? "",
    note: row.note ?? undefined,
    favoriteTrack: row.favorite_track ?? undefined,
    deezerUrl: row.deezer_url ?? undefined,
    spotifyUrl: row.spotify_url ?? undefined,
    appleMusicUrl: row.apple_music_url ?? undefined,
    genres: row.genres ?? [],
  }
}

const MAX_TEXT = 500
const MAX_NOTE = 2000
const MAX_URL = 2000

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

/**
 * N'accepte qu'une URL http(s).
 *
 * Ces valeurs alimentent des attributs `src` : sans ce filtre, un `javascript:`
 * saisi dans le formulaire s'executerait a l'affichage.
 */
function cleanUrl(value: unknown): string {
  const raw = clean(value, MAX_URL)
  if (!raw) return ""
  try {
    const url = new URL(raw)
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : ""
  } catch {
    return ""
  }
}

/**
 * Normalise une saisie utilisateur avant ecriture en base.
 * Leve une erreur si le titre est absent — c'est la seule donnee obligatoire.
 */
export function normalizeAlbumInput(input: AlbumInput): AlbumInput {
  const title = clean(input.title, MAX_TEXT)
  if (!title) throw new Error("Le titre de l'album est obligatoire.")

  const note = clean(input.note, MAX_NOTE)
  const favoriteTrack = clean(input.favoriteTrack, MAX_TEXT)

  return {
    list: assertList(input.list),
    title,
    artist: clean(input.artist, MAX_TEXT),
    year: clean(input.year, 10),
    cover: cleanUrl(input.cover),
    note: note || undefined,
    favoriteTrack: favoriteTrack || undefined,
    deezerUrl: cleanUrl(input.deezerUrl) || undefined,
    spotifyUrl: cleanUrl(input.spotifyUrl) || undefined,
    appleMusicUrl: cleanUrl(input.appleMusicUrl) || undefined,
    genres: parseGenres(formatGenres(input.genres)),
  }
}

/** Cle de facette pour les albums dont l'annee est inconnue. */
export const NO_DECADE = "none"

/** "1994" -> 1990 ; chaine vide ou invalide -> null. */
export function decadeOf(year: string | undefined): number | null {
  const parsed = Number.parseInt((year ?? "").trim(), 10)
  return Number.isFinite(parsed) && parsed > 1000 ? Math.floor(parsed / 10) * 10 : null
}

/** 1990 -> « 90s » ; 2010 -> « 2010s ». */
export function decadeLabel(decade: number): string {
  return decade >= 2000 ? `${decade}s` : `${String(decade).slice(2)}s`
}

const MAX_GENRES = 12

/** « Rock, Alternative » -> ["Rock", "Alternative"], sans doublon ni casse divergente. */
export function parseGenres(value: string): string[] {
  const seen = new Map<string, string>()
  for (const part of (value ?? "").split(",")) {
    const genre = part.trim().slice(0, 60)
    if (genre && !seen.has(genre.toLowerCase())) seen.set(genre.toLowerCase(), genre)
  }
  return [...seen.values()].slice(0, MAX_GENRES)
}

export function formatGenres(genres: string[] | undefined): string {
  return (genres ?? []).join(", ")
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function assertUuid(id: unknown): string {
  if (typeof id !== "string" || !UUID_RE.test(id)) {
    throw new Error("Identifiant d'album invalide.")
  }
  return id
}

export function assertList(list: unknown): AlbumList {
  if (list !== "top" && list !== "wannabe") {
    throw new Error("Liste inconnue.")
  }
  return list
}
