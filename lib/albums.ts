export type Album = {
  id: string
  title: string
  artist: string
  year: string
  cover: string
  note?: string
}

/** Un album tel que saisi dans le formulaire : sans id, celui-ci est genere en base. */
export type AlbumInput = Omit<Album, "id">

/** Une ligne de la table `public.albums`. */
export type AlbumRow = {
  id: string
  title: string
  artist: string | null
  year: string | null
  cover: string | null
  note: string | null
  position: number
}

export const ALBUM_COLUMNS = "id, title, artist, year, cover, note, position"

export function rowToAlbum(row: AlbumRow): Album {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist ?? "",
    year: row.year ?? "",
    cover: row.cover ?? "",
    note: row.note ?? undefined,
  }
}

const MAX_TEXT = 500
const MAX_NOTE = 2000

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

/**
 * Normalise une saisie utilisateur avant ecriture en base.
 * Leve une erreur si le titre est absent — c'est la seule donnee obligatoire.
 */
export function normalizeAlbumInput(input: AlbumInput): AlbumInput {
  const title = clean(input.title, MAX_TEXT)
  if (!title) throw new Error("Le titre de l'album est obligatoire.")

  const note = clean(input.note, MAX_NOTE)

  return {
    title,
    artist: clean(input.artist, MAX_TEXT),
    year: clean(input.year, 10),
    cover: clean(input.cover, 2000),
    note: note || undefined,
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function assertUuid(id: unknown): string {
  if (typeof id !== "string" || !UUID_RE.test(id)) {
    throw new Error("Identifiant d'album invalide.")
  }
  return id
}
