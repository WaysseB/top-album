import {
  ALBUM_COLUMNS,
  ALBUM_LISTS,
  assertList,
  assertUuid,
  normalizeAlbumInput,
  rowToAlbum,
  type Album,
  type AlbumInput,
  type AlbumList,
  type AlbumRow,
  type ListCounts,
} from "@/lib/albums"
import { supabaseRead, supabaseWrite } from "@/lib/supabase/server"

const TABLE = "albums"

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`${context} : ${error?.message ?? "erreur Supabase inconnue"}`)
}

/** Le classement complet d'une liste, du 1er au dernier. */
export async function listAlbums(list: AlbumList): Promise<Album[]> {
  const { data, error } = await supabaseRead()
    .from(TABLE)
    .select(ALBUM_COLUMNS)
    .eq("list", assertList(list))
    .order("position", { ascending: true })

  if (error) fail("Lecture des albums impossible", error)
  return (data as AlbumRow[]).map(rowToAlbum)
}

/** Nombre d'albums par liste, pour les compteurs des onglets. */
export async function countByList(): Promise<ListCounts> {
  const db = supabaseRead()

  const results = await Promise.all(
    ALBUM_LISTS.map(async (list) => {
      const { count, error } = await db
        .from(TABLE)
        .select("id", { count: "exact", head: true })
        .eq("list", list)

      if (error) fail("Comptage des albums impossible", error)
      return [list, count ?? 0] as const
    }),
  )

  return Object.fromEntries(results) as ListCounts
}

/** Prochaine position libre en fin de liste. */
async function nextPosition(list: AlbumList): Promise<number> {
  const { data, error } = await supabaseWrite()
    .from(TABLE)
    .select("position")
    .eq("list", list)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) fail("Lecture de la derniere position impossible", error)
  return ((data?.position as number | undefined) ?? 0) + 1
}

/** Insere un album en fin de sa liste. L'id est genere par Postgres. */
export async function insertAlbum(input: AlbumInput): Promise<Album> {
  const album = normalizeAlbumInput(input)

  const { data, error } = await supabaseWrite()
    .from(TABLE)
    .insert({
      list: album.list,
      title: album.title,
      artist: album.artist,
      year: album.year,
      cover: album.cover,
      note: album.note ?? null,
      favorite_track: album.favoriteTrack ?? null,
      deezer_url: album.deezerUrl ?? null,
      position: await nextPosition(album.list),
    })
    .select(ALBUM_COLUMNS)
    .single()

  if (error) fail("Ajout de l'album impossible", error)
  return rowToAlbum(data as AlbumRow)
}

export async function updateAlbum(id: string, input: AlbumInput): Promise<Album> {
  const album = normalizeAlbumInput(input)
  const albumId = assertUuid(id)
  const db = supabaseWrite()

  const { data: current, error: readError } = await db
    .from(TABLE)
    .select("list")
    .eq("id", albumId)
    .single()

  if (readError) fail("Album introuvable", readError)

  const payload: Record<string, unknown> = {
    list: album.list,
    title: album.title,
    artist: album.artist,
    year: album.year,
    cover: album.cover,
    note: album.note ?? null,
    favorite_track: album.favoriteTrack ?? null,
    deezer_url: album.deezerUrl ?? null,
  }

  // Changer de liste replace l'album en fin de liste cible : conserver son
  // ancienne position creerait un doublon dans la nouvelle numerotation.
  if (current?.list !== album.list) {
    payload.position = await nextPosition(album.list)
  }

  const { data, error } = await db
    .from(TABLE)
    .update(payload)
    .eq("id", albumId)
    .select(ALBUM_COLUMNS)
    .single()

  if (error) fail("Modification de l'album impossible", error)
  return rowToAlbum(data as AlbumRow)
}

export async function deleteAlbum(id: string): Promise<void> {
  const { error } = await supabaseWrite().from(TABLE).delete().eq("id", assertUuid(id))
  if (error) fail("Suppression de l'album impossible", error)
}

/**
 * Applique un nouvel ordre : `ids` doit contenir les albums d'UNE liste,
 * dans l'ordre voulu. La fonction SQL affecte les positions 1..N.
 */
export async function reorderAlbums(ids: string[]): Promise<void> {
  const clean = ids.map(assertUuid)
  if (clean.length === 0) return

  const { error } = await supabaseWrite().rpc("reorder_albums", { ids: clean })
  if (error) fail("Reordonnancement impossible", error)
}
