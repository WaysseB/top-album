/**
 * Synchronise la collection Discogs dans la liste « vinyl ».
 *
 *   node --env-file=.env.local scripts/discogs-sync.mjs --dry-run
 *   node --env-file=.env.local scripts/discogs-sync.mjs --dry-run --raw
 *   node --env-file=.env.local scripts/discogs-sync.mjs
 *   node --env-file=.env.local scripts/discogs-sync.mjs --prune
 *   node --env-file=.env.local scripts/discogs-sync.mjs --refresh
 *
 * Variables attendues dans .env.local :
 *   DISCOGS_USERNAME  votre identifiant Discogs (celui de l'URL du profil)
 *   DISCOGS_TOKEN     Settings > Developers > Generate token
 *
 * Options :
 *   --dry-run   n'ecrit rien, affiche le plan
 *   --raw       affiche la premiere reponse brute, pour verifier le format
 *   --limit N   ne traite que les N premiers disques
 *   --prune     supprime les vinyles retires de la collection Discogs
 *   --refresh   reapplique les donnees Discogs sur les fiches existantes
 *   --folder N  dossier Discogs (0 = la collection entiere, par defaut)
 *
 * Cle de synchronisation : `instance_id`, l'identifiant de l'EXEMPLAIRE possede,
 * et non celui du pressage. Deux exemplaires du meme disque restent deux lignes,
 * ce qui est le comportement attendu pour une collection physique.
 *
 * Les fiches existantes ne sont completees que sur leurs champs vides : les
 * notes, titres preferes et liens d'ecoute saisis a la main survivent a une
 * resynchronisation. `--refresh` force l'ecrasement par les donnees Discogs.
 */

import { createClient } from "@supabase/supabase-js"

const DRY_RUN = process.argv.includes("--dry-run")
const RAW = process.argv.includes("--raw")
const PRUNE = process.argv.includes("--prune")
const REFRESH = process.argv.includes("--refresh")

function numericArg(flag, fallback) {
  const index = process.argv.indexOf(flag)
  if (index === -1) return fallback
  const value = Number.parseInt(process.argv[index + 1] ?? "", 10)
  return Number.isFinite(value) ? value : fallback
}

const LIMIT = numericArg("--limit", Infinity)
const FOLDER = numericArg("--folder", 0)

const USERNAME = process.env.DISCOGS_USERNAME
const TOKEN = process.env.DISCOGS_TOKEN

if (!USERNAME || !TOKEN) {
  console.error("DISCOGS_USERNAME et DISCOGS_TOKEN sont attendus dans .env.local.")
  process.exit(1)
}

/**
 * Discogs impose un `User-Agent` explicite : sans lui, l'API repond 403 quelle
 * que soit la validite du jeton.
 */
const HEADERS = {
  "User-Agent": "MonTopAlbums/1.0 (+https://v0-topalbums.vercel.app)",
  Authorization: `Discogs token=${TOKEN}`,
  Accept: "application/json",
}

/** 60 requetes par minute en authentifie : une page par seconde reste large. */
const DELAY_MS = 1100
const PER_PAGE = 100
const MAX_ATTEMPTS = 4

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

async function discogs(url) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await fetch(url, { headers: HEADERS })
    if (response.ok) return response.json()

    // 429 : quota depasse. Discogs indique parfois le delai a respecter.
    if (response.status === 429 || response.status >= 500) {
      const wait = Number(response.headers.get("retry-after") ?? 0) * 1000 || attempt * 5000
      console.warn(`  HTTP ${response.status}, nouvelle tentative dans ${Math.round(wait / 1000)} s`)
      await sleep(wait)
      continue
    }

    if (response.status === 401) throw new Error("Jeton Discogs refuse (401).")
    if (response.status === 404) throw new Error(`Collection introuvable pour « ${USERNAME} » (404).`)
    throw new Error(`Discogs a repondu ${response.status} sur ${url}`)
  }
  throw new Error(`Discogs injoignable apres ${MAX_ATTEMPTS} tentatives : ${url}`)
}

/**
 * Discogs desambiguise les homonymes par un suffixe numerique — « Nirvana (2) »
 * designe bien le groupe de Seattle. Ce suffixe n'a pas de sens hors de leur
 * base.
 */
function cleanArtistName(name) {
  return (name ?? "").replace(/\s*\(\d+\)\s*$/, "").trim()
}

/** Recompose « Massive Attack feat. Horace Andy » a partir du tableau d'artistes. */
function formatArtists(artists) {
  if (!Array.isArray(artists) || artists.length === 0) return ""

  return artists
    .map((artist, index) => {
      // `anv` est le nom tel qu'il figure SUR la pochette, quand il differe.
      const name = cleanArtistName(artist.anv || artist.name)
      const join = (artist.join ?? "").trim()
      const last = index === artists.length - 1
      if (last || !join) return name
      // Une virgule se colle au mot precedent, un « & » ou un « feat. » s'espace.
      return join === "," ? `${name},` : `${name} ${join}`
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
}

/** « 2×Vinyl, LP, Album, Reissue, Blue » */
function formatSupport(formats) {
  if (!Array.isArray(formats)) return ""

  return formats
    .map((format) => {
      const qty = Number.parseInt(format.qty ?? "1", 10)
      const head = qty > 1 ? `${qty}×${format.name}` : format.name
      const parts = [head, ...(format.descriptions ?? []), format.text].filter(Boolean)
      return parts.join(", ")
    })
    .filter(Boolean)
    .join(" + ")
    .slice(0, 500)
}

/**
 * Les styles Discogs (« Post-Punk », « Shoegaze ») sont bien plus precis que les
 * genres (« Rock », « Electronic ») : ils passent devant, et les genres ne
 * viennent qu'en complement.
 */
function formatGenres(basic) {
  const all = [...(basic.styles ?? []), ...(basic.genres ?? [])]
  const seen = new Map()
  for (const raw of all) {
    const genre = (raw ?? "").trim()
    if (genre && !seen.has(genre.toLowerCase())) seen.set(genre.toLowerCase(), genre)
  }
  return [...seen.values()].slice(0, 6)
}

/** Discogs sert une image de remplacement quand le pressage n'en a pas. */
function coverOf(basic) {
  const url = basic.cover_image || basic.thumb || ""
  return url.includes("spacer.gif") ? "" : url
}

function toRow(item) {
  const basic = item.basic_information ?? {}
  const year = Number.parseInt(basic.year ?? 0, 10)

  return {
    discogs_id: item.instance_id,
    list: "vinyl",
    title: (basic.title ?? "").trim().slice(0, 500),
    artist: formatArtists(basic.artists).slice(0, 500),
    // `year` est ici l'annee du PRESSAGE possede, pas celle de la parution
    // originale : sur une collection physique, c'est bien celle-la qui compte.
    year: Number.isFinite(year) && year > 1000 ? String(year) : "",
    cover: coverOf(basic),
    genres: formatGenres(basic),
    format: formatSupport(basic.formats),
  }
}

/** Parcourt toutes les pages de la collection. */
async function fetchCollection() {
  const items = []
  let page = 1
  let pages = 1

  while (page <= pages && items.length < LIMIT) {
    const url =
      `https://api.discogs.com/users/${encodeURIComponent(USERNAME)}/collection/folders/${FOLDER}` +
      `/releases?page=${page}&per_page=${PER_PAGE}&sort=artist&sort_order=asc`

    const payload = await discogs(url)

    if (RAW && page === 1) {
      console.log("\nPremier element brut :")
      console.dir(payload.releases?.[0], { depth: 4 })
      console.log()
    }

    pages = payload.pagination?.pages ?? 1
    const batch = payload.releases ?? []
    items.push(...batch)
    console.log(`  page ${page}/${pages} — ${batch.length} disques (${items.length} au total)`)

    page += 1
    if (page <= pages) await sleep(DELAY_MS)
  }

  return items.slice(0, LIMIT === Infinity ? undefined : LIMIT)
}

/** Ne remplit que les champs vides, sauf en mode `--refresh`. */
function buildUpdate(current, next) {
  const patch = {}
  const consider = (column, value) => {
    if (!value) return
    const existing = current[column]
    const empty = Array.isArray(existing) ? existing.length === 0 : !existing
    if (REFRESH || empty) {
      if (JSON.stringify(existing ?? null) !== JSON.stringify(value)) patch[column] = value
    }
  }

  consider("title", next.title)
  consider("artist", next.artist)
  consider("year", next.year)
  consider("cover", next.cover)
  consider("genres", next.genres.length ? next.genres : null)
  consider("format", next.format)

  return patch
}

async function main() {
  console.log(`Collection Discogs de « ${USERNAME} », dossier ${FOLDER}`)
  if (DRY_RUN) console.log("Mode --dry-run : aucune ecriture.\n")

  const items = await fetchCollection()
  if (items.length === 0) {
    console.log("\nCollection vide — rien a faire.")
    return
  }

  const rows = items.map(toRow)

  const incomplete = rows.filter((row) => !row.title || !row.artist)
  if (incomplete.length > 0) {
    console.warn(`\n${incomplete.length} disque(s) sans titre ou sans artiste exploitable :`)
    for (const row of incomplete.slice(0, 5)) console.warn(`  #${row.discogs_id} ${row.artist} — ${row.title}`)
  }

  const { data: existing, error } = await supabase
    .from("albums")
    .select("id, discogs_id, title, artist, year, cover, genres, format, position")
    .eq("list", "vinyl")

  if (error) throw new Error(`Lecture des vinyles impossible : ${error.message}`)

  const byDiscogsId = new Map(
    (existing ?? []).filter((row) => row.discogs_id !== null).map((row) => [Number(row.discogs_id), row]),
  )

  const toInsert = rows.filter((row) => !byDiscogsId.has(Number(row.discogs_id)))
  const updates = rows
    .map((row) => {
      const current = byDiscogsId.get(Number(row.discogs_id))
      if (!current) return null
      const patch = buildUpdate(current, row)
      return Object.keys(patch).length > 0 ? { id: current.id, row, patch } : null
    })
    .filter(Boolean)

  const seen = new Set(rows.map((row) => Number(row.discogs_id)))
  const orphans = (existing ?? []).filter(
    (row) => row.discogs_id !== null && !seen.has(Number(row.discogs_id)),
  )
  // Les fiches sans `discogs_id` ont ete ajoutees a la main : jamais supprimees.
  const handmade = (existing ?? []).filter((row) => row.discogs_id === null).length

  console.log(`\n${rows.length} disques dans la collection`)
  console.log(`  ${toInsert.length} a ajouter`)
  console.log(`  ${updates.length} a completer${REFRESH ? " (mode --refresh)" : ""}`)
  console.log(`  ${orphans.length} retire(s) de Discogs${PRUNE ? " — seront supprimes" : " — conserves (--prune pour supprimer)"}`)
  if (handmade > 0) console.log(`  ${handmade} fiche(s) ajoutee(s) a la main, laissees intactes`)

  for (const row of toInsert.slice(0, 10)) {
    console.log(`  + ${row.artist} — ${row.title}${row.year ? ` (${row.year})` : ""} · ${row.format}`)
  }
  if (toInsert.length > 10) console.log(`  + … ${toInsert.length - 10} autres`)

  for (const { row, patch } of updates.slice(0, 10)) {
    console.log(`  ~ ${row.artist} — ${row.title} : ${Object.keys(patch).join(", ")}`)
  }
  if (updates.length > 10) console.log(`  ~ … ${updates.length - 10} autres`)

  for (const row of orphans.slice(0, 10)) console.log(`  - ${row.artist} — ${row.title}`)

  if (DRY_RUN) {
    console.log("\nRien n'a ete ecrit.")
    return
  }

  if (toInsert.length > 0) {
    // La liste s'affiche par ordre alphabetique : `position` n'est la que pour
    // satisfaire la colonne, d'ou une simple numerotation a la suite.
    const maxPosition = Math.max(0, ...(existing ?? []).map((row) => row.position ?? 0))
    const payload = toInsert.map((row, index) => ({
      ...row,
      genres: row.genres.length ? row.genres : null,
      position: maxPosition + index + 1,
    }))

    const { error: insertError } = await supabase.from("albums").insert(payload)
    if (insertError) throw new Error(`Ajout impossible : ${insertError.message}`)
    console.log(`\n${toInsert.length} vinyle(s) ajoute(s).`)
  }

  for (const { id, patch } of updates) {
    const { error: updateError } = await supabase.from("albums").update(patch).eq("id", id)
    if (updateError) throw new Error(`Mise a jour impossible : ${updateError.message}`)
  }
  if (updates.length > 0) console.log(`${updates.length} fiche(s) completee(s).`)

  if (PRUNE && orphans.length > 0) {
    const { error: deleteError } = await supabase
      .from("albums")
      .delete()
      .in("id", orphans.map((row) => row.id))

    if (deleteError) throw new Error(`Suppression impossible : ${deleteError.message}`)
    console.log(`${orphans.length} vinyle(s) supprime(s).`)
  }

  console.log("\nSynchronisation terminee.")
}

main().catch((error) => {
  console.error(`\nECHEC : ${error.message}`)
  process.exitCode = 1
})
