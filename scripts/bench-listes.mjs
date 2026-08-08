/**
 * Chronometre ce que coute le rendu d'un onglet, cote donnees.
 *
 *   node --env-file=.env.local scripts/bench-listes.mjs
 *
 * Outil de diagnostic : il reproduit les requetes de `AlbumsPage` pour situer
 * le temps passe et le poids transfere, sans rien ecrire.
 */

import { createClient } from "@supabase/supabase-js"

const COLUMNS =
  "id, list, title, artist, year, cover, note, favorite_track, deezer_url, spotify_url, apple_music_url, genres, format, position"

const LISTS = ["top", "wannabe", "ost", "vinyl"]

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

async function timed(label, run) {
  const start = performance.now()
  const result = await run()
  return { label, ms: Math.round(performance.now() - start), result }
}

const listQuery = (list) =>
  supabase.from("albums").select(COLUMNS).eq("list", list).order("position")

const countQuery = (list) =>
  supabase.from("albums").select("id", { count: "exact", head: true }).eq("list", list)

// Mesure a froid puis a chaud : le premier appel paie l'etablissement TLS.
for (const pass of ["a froid", "a chaud"]) {
  console.log(`\n=== ${pass} ===`)

  const total = await timed("total (Promise.all, comme la page)", async () => {
    const [lists, counts] = await Promise.all([
      Promise.all(LISTS.map((l) => listQuery(l))),
      Promise.all(LISTS.map((l) => countQuery(l))),
    ])
    return { lists, counts }
  })

  let rows = 0
  let bytes = 0
  for (const [index, response] of total.result.lists.entries()) {
    const data = response.data ?? []
    const size = Buffer.byteLength(JSON.stringify(data))
    rows += data.length
    bytes += size
    console.log(`  ${LISTS[index].padEnd(8)} ${String(data.length).padStart(4)} lignes  ${(size / 1024).toFixed(0).padStart(4)} Ko`)
  }

  console.log(`  ${"".padEnd(8)} ${String(rows).padStart(4)} lignes  ${(bytes / 1024).toFixed(0).padStart(4)} Ko`)
  console.log(`  ${total.ms} ms pour les 8 requetes en parallele`)

  const single = await timed("une seule liste", () => listQuery("top"))
  console.log(`  dont ${single.ms} ms pour la seule liste « top »`)
}
