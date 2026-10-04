/**
 * Complete `artist_country` : le pays d'origine de chaque artiste.
 *
 *   node --env-file=.env.local scripts/fill-countries.mjs --dry-run
 *   node --env-file=.env.local scripts/fill-countries.mjs --limit 10
 *   node --env-file=.env.local scripts/fill-countries.mjs
 *   node --env-file=.env.local scripts/fill-countries.mjs --force
 *
 * Options :
 *   --dry-run   interroge MusicBrainz mais n'ecrit rien
 *   --limit N   ne traite que les N premiers artistes
 *   --force     interroge MusicBrainz pour tous les artistes et ecrase les
 *               pays deja saisis, corrections manuelles comprises
 *
 * Le travail se fait par artiste, toutes listes confondues : une seule
 * recherche pour les douze albums de Black Sabbath, recopiee sur chacun.
 *
 * Sans --force, un artiste dont un album porte deja un pays le transmet a ses
 * autres albums sans appel reseau : c'est ainsi qu'une correction faite dans le
 * formulaire se propage. Les artistes sans aucun pays sont cherches sur
 * MusicBrainz — voir `findArtistCountry` pour la gestion des homonymes.
 *
 * Comptez une a trois secondes par artiste : MusicBrainz impose une requete par
 * seconde. La colonne « via » de la sortie dit quel artiste a ete retenu, pour
 * relire les cas douteux avant d'ecrire.
 */

import { createClient } from "@supabase/supabase-js"
import { fold } from "./deezer-match.mjs"
import { findArtistCountry, MB_DELAY_MS, sleep } from "./musicbrainz.mjs"

const DRY_RUN = process.argv.includes("--dry-run")
const FORCE = process.argv.includes("--force")
const LIMIT = (() => {
  const index = process.argv.indexOf("--limit")
  if (index === -1) return Infinity
  const value = Number.parseInt(process.argv[index + 1] ?? "", 10)
  return Number.isFinite(value) && value > 0 ? value : Infinity
})()

/** Credits qui ne designent personne : voir NOT_AN_ARTIST dans lib/stats.ts. */
const NOT_AN_ARTIST = new Set([
  "various",
  "various artists",
  "va",
  "v a",
  "artistes divers",
  "divers",
  "compilation",
  "unknown artist",
])

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

const { data, error } = await supabase
  .from("albums")
  .select("id, list, position, title, artist, artist_country")
  .order("list", { ascending: true })
  .order("position", { ascending: true })

if (error) throw new Error(`Lecture impossible : ${error.message}`)

// --- Regroupement par artiste
const byArtist = new Map()
for (const album of data) {
  const key = fold(album.artist)
  if (!key || NOT_AN_ARTIST.has(key)) continue
  const bucket = byArtist.get(key) ?? []
  bucket.push(album)
  byArtist.set(key, bucket)
}

/** Le pays le plus frequent parmi ceux deja saisis pour cet artiste. */
function knownCountry(albums) {
  const counts = new Map()
  for (const { artist_country: code } of albums) {
    if (code) counts.set(code, (counts.get(code) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

const artists = [...byArtist.values()].map((albums) => ({
  name: albums[0].artist,
  albums,
  known: knownCountry(albums),
  missing: albums.filter((album) => !album.artist_country),
}))

const candidates = artists.filter((artist) => FORCE || artist.missing.length > 0)
const todo = LIMIT === Infinity ? candidates : candidates.slice(0, LIMIT)
const lookups = todo.filter((artist) => FORCE || !artist.known).length

const seconds = Math.round((lookups * MB_DELAY_MS * 1.5) / 1000)
console.log(
  `${data.length} album(s), ${artists.length} artiste(s), ${candidates.length} a completer` +
    (todo.length < candidates.length ? `, ${todo.length} traite(s) (--limit)` : "") +
    (DRY_RUN ? "  [DRY RUN : aucune ecriture]" : ""),
)
console.log(`${lookups} recherche(s) MusicBrainz, duree estimee : ~${Math.floor(seconds / 60)} min ${seconds % 60} s\n`)

let written = 0
const notFound = []
const failures = []

for (const artist of todo) {
  const label = `${artist.name} (${artist.albums.length})`.padEnd(40)
  let country = null
  let via = ""

  if (!FORCE && artist.known) {
    country = artist.known
    via = "deja saisi sur un autre album"
  } else {
    try {
      const hit = await findArtistCountry(
        artist.name,
        artist.albums.map((album) => album.title),
      )
      if (hit) {
        country = hit.country
        via = hit.via
      }
    } catch (err) {
      console.log(`ERR  ${label} ${err instanceof Error ? err.message : err}`)
      failures.push(artist)
      await sleep(MB_DELAY_MS)
      continue
    }
    await sleep(MB_DELAY_MS)
  }

  if (!country) {
    console.log(`--   ${label} introuvable`)
    notFound.push(artist)
    continue
  }

  const targets = (FORCE ? artist.albums : artist.missing).filter((album) => album.artist_country !== country)
  console.log(`OK   ${label} ${country}  via ${via}${targets.length ? "" : "  (inchange)"}`)
  if (targets.length === 0) continue

  if (!DRY_RUN) {
    const { error: writeError } = await supabase
      .from("albums")
      .update({ artist_country: country })
      .in(
        "id",
        targets.map((album) => album.id),
      )

    if (writeError) {
      console.log(`       ecriture impossible : ${writeError.message}`)
      failures.push(artist)
      continue
    }
  }
  written += targets.length
}

console.log()
console.log(`${written} album(s) ${DRY_RUN ? "a mettre a jour (rien ecrit)" : "mis a jour"}`)

if (notFound.length) {
  console.log(`\n${notFound.length} artiste(s) sans pays trouve, a renseigner dans le formulaire :`)
  for (const a of notFound) {
    console.log(`  ${a.name}  —  ${a.albums.map((album) => `${album.list}#${album.position}`).join(", ")}`)
  }
}
if (failures.length) {
  console.log(`\n${failures.length} echec(s) technique(s), a relancer :`)
  for (const a of failures) console.log(`  ${a.name}`)
}
