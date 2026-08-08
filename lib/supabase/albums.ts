import {
  ALBUM_COLUMNS,
  ALBUM_LISTS,
  assertList,
  assertUuid,
  LIST_IS_RANKED,
  normalizeAlbumInput,
  rowToAlbum,
  type Album,
  type AlbumInput,
  type AlbumList,
  type AlbumRow,
  type ListCounts,
} from "@/lib/albums"
import { ingestCover, isHostedCover } from "@/lib/covers"
import { supabaseRead, supabaseWrite } from "@/lib/supabase/server"

const TABLE = "albums"

/**
 * Rapatrie la pochette dans Supabase Storage avant enregistrement.
 *
 * Une URL deja hebergee n'est pas retouchee — c'est le cas d'une modification
 * qui ne concerne pas la pochette. En cas d'echec du rapatriement, l'URL
 * distante est conservee telle quelle : l'album doit s'enregistrer quoi qu'il
 * arrive, `scripts/backfill-covers.mjs` repassera derriere.
 */
async function coverColumns(
  cover: string,
  currentSource?: string | null,
): Promise<{ cover: string; cover_source: string | null }> {
  if (!cover) return { cover: "", cover_source: null }
  if (isHostedCover(cover)) return { cover, cover_source: currentSource ?? null }

  const result = await ingestCover(cover)
  if (result.ok) return { cover: result.url, cover_source: cover }

  console.warn(`[covers] rapatriement impossible (${result.reason}) : ${cover}`)
  return { cover, cover_source: null }
}

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`${context} : ${error?.message ?? "erreur Supabase inconnue"}`)
}

/**
 * Le contenu complet d'une liste.
 *
 * Le top suit `position`, son classement. Les autres listes sont alphabetiques :
 * elles n'ont pas de hierarchie, et un ordre d'insertion donnerait a lire un
 * palmares qui n'existe pas. `position` y reste maintenue pour rester
 * reversible, mais n'est plus utilisee a l'affichage.
 */
export async function listAlbums(list: AlbumList): Promise<Album[]> {
  const target = assertList(list)
  const query = supabaseRead().from(TABLE).select(ALBUM_COLUMNS).eq("list", target)

  const { data, error } = LIST_IS_RANKED[target]
    ? await query.order("position", { ascending: true })
    : await query.order("artist", { ascending: true }).order("title", { ascending: true })

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
      ...(await coverColumns(album.cover)),
      note: album.note ?? null,
      favorite_track: album.favoriteTrack ?? null,
      deezer_url: album.deezerUrl ?? null,
      spotify_url: album.spotifyUrl ?? null,
      apple_music_url: album.appleMusicUrl ?? null,
      genres: album.genres.length ? album.genres : null,
      format: album.format ?? null,
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
    .select("list, cover_source")
    .eq("id", albumId)
    .single()

  if (readError) fail("Album introuvable", readError)

  const payload: Record<string, unknown> = {
    list: album.list,
    title: album.title,
    artist: album.artist,
    year: album.year,
    ...(await coverColumns(album.cover, current?.cover_source as string | null)),
    note: album.note ?? null,
    favorite_track: album.favoriteTrack ?? null,
    deezer_url: album.deezerUrl ?? null,
    spotify_url: album.spotifyUrl ?? null,
    apple_music_url: album.appleMusicUrl ?? null,
    genres: album.genres.length ? album.genres : null,
    format: album.format ?? null,
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
 * Applique un nouvel ordre. `ids` doit contenir TOUS les albums d'UNE liste,
 * dans l'ordre voulu : la fonction SQL leur affecte les positions 1..N.
 * Un sous-ensemble ecraserait les positions des albums absents de la liste.
 */
export async function reorderAlbums(ids: string[]): Promise<void> {
  const clean = ids.map(assertUuid)
  if (clean.length === 0) return

  const { error } = await supabaseWrite().rpc("reorder_albums", { ids: clean })
  if (error) fail("Reordonnancement impossible", error)
}
