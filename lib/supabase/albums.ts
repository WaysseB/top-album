import {
  ALBUM_COLUMNS,
  assertUuid,
  normalizeAlbumInput,
  rowToAlbum,
  type Album,
  type AlbumInput,
  type AlbumRow,
} from "@/lib/albums"
import { supabaseRead, supabaseWrite } from "@/lib/supabase/server"

const TABLE = "albums"

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`${context} : ${error?.message ?? "erreur Supabase inconnue"}`)
}

/** Le classement complet, du 1er au dernier. */
export async function listAlbums(): Promise<Album[]> {
  const { data, error } = await supabaseRead()
    .from(TABLE)
    .select(ALBUM_COLUMNS)
    .order("position", { ascending: true })

  if (error) fail("Lecture des albums impossible", error)
  return (data as AlbumRow[]).map(rowToAlbum)
}

/** Prochaine position libre en fin de classement. */
async function nextPosition(): Promise<number> {
  const { data, error } = await supabaseWrite()
    .from(TABLE)
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) fail("Lecture de la derniere position impossible", error)
  return ((data?.position as number | undefined) ?? 0) + 1
}

/** Insere un album en fin de classement. L'id est genere par Postgres. */
export async function insertAlbum(input: AlbumInput): Promise<Album> {
  const album = normalizeAlbumInput(input)

  const { data, error } = await supabaseWrite()
    .from(TABLE)
    .insert({
      title: album.title,
      artist: album.artist,
      year: album.year,
      cover: album.cover,
      note: album.note ?? null,
      position: await nextPosition(),
    })
    .select(ALBUM_COLUMNS)
    .single()

  if (error) fail("Ajout de l'album impossible", error)
  return rowToAlbum(data as AlbumRow)
}

export async function updateAlbum(id: string, input: AlbumInput): Promise<Album> {
  const album = normalizeAlbumInput(input)

  const { data, error } = await supabaseWrite()
    .from(TABLE)
    .update({
      title: album.title,
      artist: album.artist,
      year: album.year,
      cover: album.cover,
      note: album.note ?? null,
    })
    .eq("id", assertUuid(id))
    .select(ALBUM_COLUMNS)
    .single()

  if (error) fail("Modification de l'album impossible", error)
  return rowToAlbum(data as AlbumRow)
}

export async function deleteAlbum(id: string): Promise<void> {
  const { error } = await supabaseWrite().from(TABLE).delete().eq("id", assertUuid(id))
  if (error) fail("Suppression de l'album impossible", error)
}

/** Applique un nouvel ordre : `ids` doit contenir les albums dans l'ordre voulu. */
export async function reorderAlbums(ids: string[]): Promise<void> {
  const clean = ids.map(assertUuid)
  if (clean.length === 0) return

  const { error } = await supabaseWrite().rpc("reorder_albums", { ids: clean })
  if (error) fail("Reordonnancement impossible", error)
}

/**
 * Import en masse (fichier Topsters).
 * `replace` vide le classement avant insertion, sinon les albums sont ajoutes a la suite.
 */
export async function importAlbums(inputs: AlbumInput[], replace: boolean): Promise<void> {
  const albums = inputs.map(normalizeAlbumInput)
  if (albums.length === 0) return

  const db = supabaseWrite()

  if (replace) {
    const { error } = await db.from(TABLE).delete().not("id", "is", null)
    if (error) fail("Vidage du classement impossible", error)
  }

  const start = replace ? 1 : await nextPosition()

  const { error } = await db.from(TABLE).insert(
    albums.map((album, index) => ({
      title: album.title,
      artist: album.artist,
      year: album.year,
      cover: album.cover,
      note: album.note ?? null,
      position: start + index,
    })),
  )

  if (error) fail("Import des albums impossible", error)
}
