/**
 * Le top assume, la liste d'attente, les musiques de jeux video, et la
 * collection vinyle — celle-ci synchronisee depuis Discogs, pas saisie a la main.
 */
export type AlbumList = "top" | "wannabe" | "ost" | "vinyl"

export const ALBUM_LISTS: AlbumList[] = ["top", "wannabe", "ost", "vinyl"]

export const LIST_LABELS: Record<AlbumList, string> = {
  top: "Mon Top Albums",
  wannabe: "Wannabe",
  ost: "OST de jeux vidéo",
  vinyl: "Mes vinyles",
}

/** Libelle court, pour les onglets. */
export const LIST_TAB_LABELS: Record<AlbumList, string> = {
  top: "Top",
  wannabe: "Wannabe",
  ost: "OST",
  vinyl: "Vinyles",
}

export const LIST_PATHS: Record<AlbumList, string> = {
  top: "/",
  wannabe: "/wannabe",
  ost: "/ost",
  vinyl: "/vinyles",
}

/**
 * Affichage du numero de rang.
 *
 * A ne pas confondre avec la possibilite de reordonner, qui vaut pour TOUTES
 * les listes : chacune suit `position` et se reorganise depuis le front. Seul
 * le top assume ce classement en le montrant ; ailleurs le numero laisserait
 * croire a une hierarchie qui n'existe pas, alors que l'ordre n'est qu'un
 * rangement personnel.
 */
export const LIST_SHOWS_RANK: Record<AlbumList, boolean> = {
  top: true,
  wannabe: false,
  ost: false,
  vinyl: false,
}

/**
 * Les listes qui relevent du gout, par opposition a l'inventaire physique.
 *
 * La collection vinyle en est exclue : elle recense des objets possedes et
 * recoupe largement les autres listes. L'y melanger fausserait tout ce qui se
 * veut representatif — un tirage au hasard y renverrait souvent un album deja
 * classe ailleurs, et des statistiques globales compteraient deux fois le meme
 * disque.
 *
 * Elle reste bien sur consultable pour elle-meme, onglet et perimetre compris.
 */
export const CURATED_LISTS: AlbumList[] = ["top", "wannabe", "ost"]

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
  /**
   * Support physique, tel que decrit par Discogs : « 2×Vinyl, LP, Album,
   * Reissue ». Vide hors collection vinyle.
   */
  format?: string
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
  format: string | null
  position: number
}

export const ALBUM_COLUMNS =
  "id, list, title, artist, year, cover, note, favorite_track, deezer_url, spotify_url, apple_music_url, genres, format, position"

export function rowToAlbum(row: AlbumRow): Album {
  return {
    id: row.id,
    list: (ALBUM_LISTS as string[]).includes(row.list) ? (row.list as AlbumList) : "top",
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
    format: row.format ?? undefined,
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
  const format = clean(input.format, MAX_TEXT)

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
    format: format || undefined,
  }
}

/** Repli des accents et de la casse. « Bjork » et « Björk » se rejoignent. */
export function fold(value: string): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
}

/** Mentions d'edition ou de bande originale, qui ne distinguent pas un disque. */
const EDITION_MARKERS =
  /(bande originale|original\s+(motion\s+picture\s+|video\s+game\s+|series\s+|game\s+)?(sound\s?track|score|sound\s+collection)|complete\s+(original\s+)?(score|sound\s+collection|soundtrack)|sound\s?track|o\.?s\.?t\.?|anniversary edition|deluxe edition|vinyl (set|edition)|remaster(ed)?|reissue)/

/**
 * Cle de rapprochement d'un album d'une liste a l'autre.
 *
 * Le titre seul, sans l'artiste : sur les bandes originales, le credit est
 * instable d'une source a l'autre. « Castlevania » est signe Kinuyo Yamashita
 * a la saisie et Konami Kukeiha Club chez Discogs ; « Tekken 3 » passe de
 * Nobuyoshi Sano a Namco Sounds. Exiger l'egalite des artistes condamnait la
 * moitie des rapprochements — mesure sur la collection : 56 contre 71.
 *
 * Le titre est ramene a sa forme nue : groupes entre parentheses, mentions
 * d'edition et suffixes de bande originale retires, « & » ramene a « and », et
 * depouillement final des caracteres non latins — ce qui fait au passage
 * rejoindre « Comix Zone コミックスゾーン » et « Comix Zone ».
 */
export function matchKey(album: Pick<Album, "title">): string {
  let title = fold(album.title)
    .replace(/[（(\[<][^)）\]>]*[)）\]>]/g, " ")
    .replace(/&/g, " and ")

  // Les segments de queue sont retires depuis la fin, tant qu'ils portent une
  // mention d'edition. Couper au premier « : » amputerait « Castlevania:
  // Symphony of the Night » de ce qui l'identifie.
  for (let pass = 0; pass < 4; pass++) {
    const split = title.match(/^(.*?)\s*[:\-–—]\s*([^:\-–—]+)$/)
    if (split && EDITION_MARKERS.test(split[2])) {
      title = split[1]
      continue
    }

    // Mention accolee sans separateur : « Tekken 3 Original Soundtrack ».
    const trimmed = title.replace(
      /\s+(original\s+)?(motion\s+picture\s+|video\s+game\s+|series\s+|game\s+)?(sound\s?track|score|sound\s+collection)\s*$/,
      "",
    )
    if (trimmed === title) break
    title = trimmed
  }

  return title.replace(/[^a-z0-9]/g, "")
}

/** Regroupe des albums par cle de rapprochement. */
export function indexByMatchKey(albums: Album[]): Map<string, Album[]> {
  const index = new Map<string, Album[]>()
  for (const album of albums) {
    const key = matchKey(album)
    if (!key) continue
    const bucket = index.get(key)
    if (bucket) bucket.push(album)
    else index.set(key, [album])
  }
  return index
}

/**
 * Retrouve un album dans un index construit sur une autre liste.
 *
 * Quand plusieurs disques partagent le meme titre nu — deux homonymes
 * d'artistes differents — l'artiste tranche. Sans lui pour departager, on
 * s'abstient plutot que de rapprocher au hasard.
 */
export function findSameAlbum(album: Album, index: Map<string, Album[]>): Album | null {
  const candidates = index.get(matchKey(album))
  if (!candidates?.length) return null
  if (candidates.length === 1) return candidates[0]

  const artist = fold(album.artist)
  return candidates.find((c) => fold(c.artist) === artist) ?? null
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
  if (typeof list !== "string" || !(ALBUM_LISTS as string[]).includes(list)) {
    throw new Error("Liste inconnue.")
  }
  return list as AlbumList
}
