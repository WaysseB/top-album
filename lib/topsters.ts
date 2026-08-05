import type { Album } from "@/lib/albums"

// Topsters export files (topsters2 / topsters3 / topster / .json).
//
// Topsters 3 (topsters.org) does NOT write plain JSON. Its export pipeline is:
//   JSON.stringify(charts)  ->  TextEncoder  ->  deflate (zlib)
//   ->  Uint8Array.toString() (comma-joined byte values)  ->  btoa (base64)
// So the file is base64 of a string like "120,156,45,...". We reverse that,
// inflate it, then parse the JSON. We also still accept plain-JSON exports
// (older/other tools, and files we produced ourselves before this change).

type UnknownRecord = Record<string, unknown>

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === "object" && v !== null
}

function firstString(obj: UnknownRecord, keys: string[]): string {
  for (const key of keys) {
    const val = obj[key]
    if (typeof val === "string" && val.trim()) return val.trim()
    if (typeof val === "number") return String(val)
  }
  return ""
}

// Pull a 4-digit year out of whatever date-ish field we can find.
function extractYear(obj: UnknownRecord): string {
  const raw = firstString(obj, ["year", "released", "releaseDate", "date", "release_date"])
  const match = raw.match(/\b(1\d{3}|20\d{2})\b/)
  return match ? match[1] : ""
}

// Topsters 3 has no artist field: it stores everything in `title`, formatted
// as "Artiste - Album". Other tools use a separate `creator`/`artist` key.
// Surrounding spaces are required so hyphenated names survive ("Alt-J", "At the Drive-In").
const ARTIST_SEPARATORS = [" - ", " – ", " — "]

/**
 * Split "Artiste - Album" into its two parts.
 *
 * `knownArtist` wins when the file provides one; it is then also stripped from
 * the beginning of the title when it is repeated there (the case for files we
 * export ourselves, which write both).
 */
function splitArtistTitle(rawTitle: string, knownArtist: string): { artist: string; title: string } {
  if (knownArtist) {
    for (const separator of ARTIST_SEPARATORS) {
      const prefix = knownArtist + separator
      if (rawTitle.toLowerCase().startsWith(prefix.toLowerCase())) {
        return { artist: knownArtist, title: rawTitle.slice(prefix.length).trim() }
      }
    }
    return { artist: knownArtist, title: rawTitle }
  }

  // Cut on the FIRST separator only: "Artiste - Album - Deluxe Edition"
  // must yield the artist, not swallow half the album name.
  let cut = -1
  let width = 0
  for (const separator of ARTIST_SEPARATORS) {
    const index = rawTitle.indexOf(separator)
    if (index > 0 && (cut === -1 || index < cut)) {
      cut = index
      width = separator.length
    }
  }
  if (cut === -1) return { artist: "", title: rawTitle }

  const artist = rawTitle.slice(0, cut).trim()
  const title = rawTitle.slice(cut + width).trim()

  // Un cote vide = ce n'etait pas un separateur artiste/album.
  return artist && title ? { artist, title } : { artist: "", title: rawTitle }
}

// Decompress bytes, trying the compression formats Topsters may have used.
async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  let lastErr: unknown
  for (const format of ["deflate", "deflate-raw", "gzip"] as const) {
    try {
      const ds = new DecompressionStream(format)
      const stream = new Response(bytes as unknown as BodyInit).body!.pipeThrough(ds)
      return new Uint8Array(await new Response(stream).arrayBuffer())
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("decompress failed")
}

// Turn the raw file contents into a JSON string, decoding Topsters 3's
// base64 + deflate wrapper when the content isn't already plain JSON.
async function decodeToJsonText(raw: string): Promise<string> {
  const text = raw.trim()

  // Plain JSON (our own older exports, or tools that don't compress).
  if (text.startsWith("{") || text.startsWith("[")) return text

  // Otherwise assume the Topsters compressed format.
  let decoded: string
  try {
    decoded = atob(text)
  } catch {
    throw new Error("Fichier illisible : ce n'est pas un export Topsters reconnu.")
  }

  let bytes: Uint8Array
  const trimmed = decoded.trim()
  if (/^\d+(\s*,\s*\d+)*$/.test(trimmed)) {
    // Topsters 3: Uint8Array.toString() -> "120,156,45,..."
    bytes = Uint8Array.from(trimmed.split(",").map((n) => Number.parseInt(n, 10)))
  } else {
    // Fallback: base64 of raw binary bytes.
    bytes = Uint8Array.from(decoded, (c) => c.charCodeAt(0))
  }

  try {
    const inflated = await inflate(bytes)
    return new TextDecoder().decode(inflated)
  } catch {
    throw new Error("Fichier illisible : impossible de décompresser l'export Topsters.")
  }
}

// Find the array of chart items regardless of how deeply it's nested.
// Topsters 3 wraps it as { [uuid]: { timestamp, data: { items: [...] } } }.
function findItems(root: unknown, depth = 0): unknown[] {
  if (Array.isArray(root)) return root
  if (!isRecord(root) || depth > 5) return []

  for (const key of ["cards", "items", "albums", "entries", "list"]) {
    const val = root[key]
    if (Array.isArray(val)) return val
  }
  // Recurse through nested objects (data, chart, state, or the uuid wrapper).
  for (const val of Object.values(root)) {
    if (isRecord(val) || Array.isArray(val)) {
      const found = findItems(val, depth + 1)
      if (found.length) return found
    }
  }
  return []
}

export type TopstersParseResult = {
  albums: Omit<Album, "id">[]
  skipped: number
}

export async function parseTopsters(text: string): Promise<TopstersParseResult> {
  const jsonText = await decodeToJsonText(text)

  let root: unknown
  try {
    root = JSON.parse(jsonText)
  } catch {
    throw new Error("Fichier illisible : contenu Topsters non valide.")
  }

  const items = findItems(root)
  if (items.length === 0) {
    throw new Error("Aucun album trouvé dans ce fichier Topsters.")
  }

  const albums: Omit<Album, "id">[] = []
  let skipped = 0

  for (const item of items) {
    // Topsters uses `null` for empty grid cells.
    if (!isRecord(item)) {
      skipped++
      continue
    }
    const rawTitle = firstString(item, ["title", "name", "album", "albumTitle"])
    const cover = firstString(item, ["coverURL", "src", "cover", "image", "imageURL", "img", "url"])

    if (!rawTitle && !cover) {
      skipped++
      continue
    }

    const { artist, title } = splitArtistTitle(
      rawTitle,
      firstString(item, ["creator", "artist", "subtitle", "artistName", "by"]),
    )

    albums.push({
      title: title || "Sans titre",
      artist,
      year: extractYear(item),
      cover,
      note: firstString(item, ["comment", "note"]) || undefined,
    })
  }

  if (albums.length === 0) {
    throw new Error("Aucun album valide trouvé dans ce fichier Topsters.")
  }

  return { albums, skipped }
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("deflate")
  const stream = new Response(bytes as unknown as BodyInit).body!.pipeThrough(cs)
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

// Serialize the current list into a real Topsters 3 `.topster` file so it
// can be re-imported into topsters.org. We mirror its exact pipeline:
// StoredCharts JSON -> deflate -> Uint8Array.toString() -> base64.
export async function toTopstersFile(albums: Album[], title = "Mon Top Albums"): Promise<string> {
  const columns = 5
  const rows = Math.max(1, Math.ceil(albums.length / columns))

  const items: (UnknownRecord | null)[] = albums.map((a) => ({
    title: a.title,
    creator: a.artist,
    coverURL: a.cover,
  }))
  // Pad the grid with empty cells so the layout matches the declared size.
  while (items.length < columns * rows) items.push(null)

  const chart = {
    backgroundUrl: "",
    backgroundColor: "#000000",
    backgroundType: "color",
    title,
    items,
    size: { x: columns, y: rows },
    showNumbers: true,
    showTitles: true,
    gap: 20,
    roundCorners: false,
  }

  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : String(Date.now())

  const storedCharts = {
    [uuid]: { timestamp: Date.now(), data: chart },
  }

  const str = JSON.stringify(storedCharts)
  const arr = new TextEncoder().encode(str)
  const zlibbed = await deflate(arr)
  return btoa(zlibbed.toString())
}
