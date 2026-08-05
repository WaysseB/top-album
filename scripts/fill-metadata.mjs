/**
 * Complete `year` et `genres`.
 *
 *   node --env-file=.env.local scripts/fill-metadata.mjs --dry-run
 *   node --env-file=.env.local scripts/fill-metadata.mjs --limit 10
 *   node --env-file=.env.local scripts/fill-metadata.mjs --force
 *   node --env-file=.env.local scripts/fill-metadata.mjs --years-only
 *
 * Deux sources, chacune pour ce qu'elle sait faire :
 *
 *   annee   MusicBrainz  date de PREMIERE sortie de l'oeuvre. Deezer ne
 *                        connait que l'edition liee et renverrait 1998
 *                        pour « Paranoid », qui date de 1970.
 *   genres  Deezer       grossiers (Rock, Alternative, Metal...), mais
 *                        suffisants pour un filtre. Corrigeables ensuite
 *                        dans le formulaire de l'application.
 *
 * Par defaut, un album dont l'annee ET les genres sont deja renseignes est
 * ignore ; `--force` recalcule tout.
 */

import { createClient } from "@supabase/supabase-js"
import { DELAY_MS, sleep } from "./deezer-match.mjs"
import { findFirstReleaseYear, MB_DELAY_MS } from "./musicbrainz.mjs"

const DRY_RUN = process.argv.includes("--dry-run")
const FORCE = process.argv.includes("--force")
const YEARS_ONLY = process.argv.includes("--years-only")
const LIMIT = (() => {
  const index = process.argv.indexOf("--limit")
  if (index === -1) return Infinity
  const value = Number.parseInt(process.argv[index + 1] ?? "", 10)
  return Number.isFinite(value) && value > 0 ? value : Infinity
})()

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

/** Identifiant numerique contenu dans une URL Deezer d'album. */
function albumId(url) {
  return /\/album\/(\d+)/.exec(url ?? "")?.[1] ?? null
}

async function fetchDeezerGenres(id) {
  const response = await fetch(`https://api.deezer.com/album/${id}`, {
    headers: { accept: "application/json" },
  })
  if (!response.ok) throw new Error(`Deezer a repondu ${response.status}`)

  const payload = await response.json()
  if (payload?.error) throw new Error(payload.error.message ?? "erreur Deezer")

  // Deezer renvoie parfois un genre fantome d'identifiant -1.
  return Array.from(
    new Set(
      (payload?.genres?.data ?? [])
        .filter((g) => g?.id !== -1 && typeof g?.name === "string" && g.name.trim())
        .map((g) => g.name.trim()),
    ),
  )
}

const { data, error } = await supabase
  .from("albums")
  .select("id, list, position, title, artist, year, genres, deezer_url")
  .order("list", { ascending: true })
  .order("position", { ascending: true })

if (error) throw new Error(`Lecture impossible : ${error.message}`)

const hasYear = (album) => Boolean(album.year && album.year.trim())
const hasGenres = (album) => Array.isArray(album.genres) && album.genres.length > 0

const candidates = data.filter((album) => {
  if (FORCE) return true
  if (!hasYear(album)) return true
  return !YEARS_ONLY && !hasGenres(album) && Boolean(albumId(album.deezer_url))
})

const todo = LIMIT === Infinity ? candidates : candidates.slice(0, LIMIT)

const seconds = Math.round((todo.length * (MB_DELAY_MS + DELAY_MS)) / 1000)
console.log(
  `${data.length} album(s), ${candidates.length} a completer` +
    (todo.length < candidates.length ? `, ${todo.length} traite(s) (--limit)` : "") +
    (DRY_RUN ? "  [DRY RUN : aucune ecriture]" : ""),
)
console.log(`duree estimee : ~${Math.floor(seconds / 60)} min ${seconds % 60} s\n`)

let updated = 0
const noYear = []
const failures = []

for (const album of todo) {
  const where = `${album.list}#${album.position}`.padEnd(12)
  const who = `${album.artist} - ${album.title}`
  const patch = {}
  const notes = []

  // --- Annee : MusicBrainz
  if (FORCE || !hasYear(album)) {
    try {
      const hit = await findFirstReleaseYear(album.artist ?? "", album.title)
      if (hit) {
        patch.year = hit.year
        notes.push(`annee ${hit.year}`)
      } else {
        noYear.push(album)
        notes.push("annee introuvable")
      }
    } catch (err) {
      notes.push(`annee ERR ${err instanceof Error ? err.message : err}`)
      failures.push(album)
    }
    await sleep(MB_DELAY_MS)
  }

  // --- Genres : Deezer
  const id = albumId(album.deezer_url)
  if (!YEARS_ONLY && id && (FORCE || !hasGenres(album))) {
    try {
      const genres = await fetchDeezerGenres(id)
      if (genres.length) {
        patch.genres = genres
        notes.push(`genres ${genres.join(", ")}`)
      }
    } catch (err) {
      notes.push(`genres ERR ${err instanceof Error ? err.message : err}`)
    }
    await sleep(DELAY_MS)
  }

  if (Object.keys(patch).length === 0) {
    console.log(`--   ${where} ${who}\n       ${notes.join("  |  ") || "rien a completer"}`)
    continue
  }

  console.log(`OK   ${where} ${who}\n       ${notes.join("  |  ")}`)

  if (!DRY_RUN) {
    const { error: writeError } = await supabase.from("albums").update(patch).eq("id", album.id)
    if (writeError) {
      console.log(`       ecriture impossible : ${writeError.message}`)
      failures.push(album)
      continue
    }
  }
  updated++
}

console.log()
console.log(`${updated}/${todo.length} album(s) complete(s)${DRY_RUN ? " (rien ecrit)" : ""}`)

if (noYear.length) {
  console.log(`\n${noYear.length} album(s) sans annee trouvee :`)
  for (const a of noYear) console.log(`  ${a.list}#${a.position}  ${a.artist} - ${a.title}`)
}
if (failures.length) {
  console.log(`\n${failures.length} echec(s) technique(s) :`)
  for (const a of failures) console.log(`  ${a.list}#${a.position}  ${a.artist} - ${a.title}`)
}
