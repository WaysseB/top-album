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
 *   --all-formats  inclut les CD, cassettes et autres supports non vinyle
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
 *
 * L'annee enregistree est celle de la PREMIERE PARUTION, lue sur le « master »
 * Discogs — c'est la seule qui rende les statistiques comparables entre les
 * quatre listes. L'annee du pressage possede figure sur la ligne de support,
 * sous la forme « … · pressage 2016 », quand elle differe.
 */

import { createClient } from "@supabase/supabase-js"

const DRY_RUN = process.argv.includes("--dry-run")
const RAW = process.argv.includes("--raw")
const PRUNE = process.argv.includes("--prune")
const REFRESH = process.argv.includes("--refresh")
const ALL_FORMATS = process.argv.includes("--all-formats")

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

if (!USERNAME) {
  console.error("DISCOGS_USERNAME est attendu dans .env.local.")
  process.exit(1)
}

// `--limit` tronque la collection lue : tout ce qui suit passerait pour retire
// de Discogs, et `--prune` le supprimerait. Les deux ne vont pas ensemble.
if (PRUNE && LIMIT !== Infinity) {
  console.error("--prune et --limit sont incompatibles : la collection tronquee ferait passer le reste pour supprime.")
  process.exit(1)
}

/**
 * Discogs impose un `User-Agent` explicite : sans lui, l'API repond 403.
 *
 * Le jeton est facultatif : une collection publique se lit anonymement. Il
 * devient necessaire si la collection passe en privee, et releve au passage le
 * quota de 25 a 60 requetes par minute.
 */
const HEADERS = {
  "User-Agent": "MonTopAlbums/1.0 (+https://v0-topalbums.vercel.app)",
  Accept: "application/json",
  ...(TOKEN ? { Authorization: `Discogs token=${TOKEN}` } : {}),
}

const DELAY_MS = TOKEN ? 1100 : 2500
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

    if (response.status === 401 || response.status === 403) {
      throw new Error(
        TOKEN
          ? `Jeton Discogs refuse (${response.status}).`
          : `Collection privee (${response.status}) : renseignez DISCOGS_TOKEN dans .env.local.`,
      )
    }
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
    // Un « = » relie la graphie originale a sa traduction (« Daft Punk = ダフト・
    // パンク ») : ce n'est pas une collaboration, seul le premier nom est retenu.
    .slice(0, Math.max(1, artists.findIndex((a) => (a.join ?? "").trim() === "=") + 1 || artists.length))
    .map((artist, index, kept) => {
      // Le nom canonique prime sur `anv`, le credit imprime sur la pochette :
      // celui-ci est souvent abrege (« Streisand » pour « Barbra Streisand »),
      // ce qui couperait l'artiste de ses autres albums dans la recherche.
      const name = cleanArtistName(artist.name || artist.anv)
      const join = (artist.join ?? "").trim()
      const last = index === kept.length - 1
      if (last || !join || join === "=") return name
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

/**
 * Meme convention que pour les artistes : « Random Access Memories = ランダム・
 * アクセス・メモリーズ » designe un seul et meme disque.
 */
function cleanTitle(title) {
  return (title ?? "").split(" = ")[0].trim().slice(0, 500)
}

/**
 * Un exemplaire compte comme vinyle des lors qu'un de ses supports en est un :
 * les coffrets se declarent « Box Set » en plus de leurs disques.
 */
const VINYL_FORMATS = /vinyl|flexi|shellac|acetate|lathe/i

function isVinyl(basic) {
  return (basic.formats ?? []).some(
    (format) =>
      VINYL_FORMATS.test(format.name ?? "") ||
      (format.descriptions ?? []).some((d) => VINYL_FORMATS.test(d)),
  )
}

/** Discogs sert une image de remplacement quand le pressage n'en a pas. */
function coverOf(basic) {
  const url = basic.cover_image || basic.thumb || ""
  return url.includes("spacer.gif") ? "" : url
}

function parseYear(value) {
  const year = Number.parseInt(value ?? 0, 10)
  return Number.isFinite(year) && year > 1000 ? String(year) : ""
}

/**
 * Un exemplaire de la collection : la ligne a ecrire, et ce qu'il faut garder de
 * cote pour la completer (l'annee du pressage, et le master qui portera l'annee
 * de parution originale).
 */
function toEntry(item) {
  const basic = item.basic_information ?? {}
  const pressingYear = parseYear(basic.year)

  return {
    masterId: basic.master_id || null,
    pressingYear,
    support: formatSupport(basic.formats),
    row: {
      discogs_id: item.instance_id,
      list: "vinyl",
      title: cleanTitle(basic.title),
      artist: formatArtists(basic.artists).slice(0, 500),
      // Remplacee par l'annee de parution originale des que le master est connu.
      year: pressingYear,
      cover: coverOf(basic),
      genres: formatGenres(basic),
      format: formatSupport(basic.formats),
    },
  }
}

/**
 * Remplace l'annee du pressage par celle de la premiere parution, lue sur le
 * « master » Discogs.
 *
 * Sans cela, une reedition 2016 du « Dark Side of the Moon » se compte dans les
 * annees 2010 : les statistiques melangent les quatre listes, et le Top est
 * date, lui, a la premiere parution. L'annee du pressage n'est pas perdue pour
 * autant, elle rejoint la ligne de support.
 *
 * Une requete par master, d'ou l'appel restreint aux fiches reellement ecrites.
 */
async function resolveOriginalYears(entries) {
  const targets = entries.filter((entry) => entry.masterId)
  if (targets.length === 0) return

  console.log(`\nAnnees de parution originale : ${targets.length} master(s) a interroger…`)
  const cache = new Map()
  let resolved = 0

  for (const [index, entry] of targets.entries()) {
    let year = cache.get(entry.masterId)

    if (year === undefined) {
      const master = await discogs(`https://api.discogs.com/masters/${entry.masterId}`)
      year = parseYear(master.year)
      cache.set(entry.masterId, year)
      if (index < targets.length - 1) await sleep(DELAY_MS)
    }

    if (year) {
      entry.row.year = year
      resolved += 1
    }

    if ((index + 1) % 25 === 0) console.log(`  ${index + 1}/${targets.length}`)
  }

  // Le pressage se lit alors sur la ligne de support, et seulement quand il
  // differe de la parution — sinon l'information ferait doublon.
  for (const entry of entries) {
    if (entry.pressingYear && entry.pressingYear !== entry.row.year) {
      entry.row.format = `${entry.support} · pressage ${entry.pressingYear}`.slice(0, 500)
    }
  }

  const fallback = entries.length - resolved
  console.log(`  ${resolved} datee(s) a la parution originale, ${fallback} au pressage faute de master.`)
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

  const all = await fetchCollection()
  if (all.length === 0) {
    console.log("\nCollection vide — rien a faire.")
    return
  }

  // La collection Discogs peut contenir des CD ou des cassettes : cette liste-ci
  // ne montre que les disques.
  const items = ALL_FORMATS ? all : all.filter((item) => isVinyl(item.basic_information ?? {}))
  const skipped = all.length - items.length
  if (skipped > 0) {
    console.log(`\n${skipped} exemplaire(s) ecarte(s), support non vinyle (--all-formats pour les inclure) :`)
    for (const item of all.filter((i) => !isVinyl(i.basic_information ?? {})).slice(0, 10)) {
      const basic = item.basic_information ?? {}
      console.log(`  · ${cleanTitle(basic.title)} — ${formatSupport(basic.formats)}`)
    }
  }

  const entries = items.map(toEntry)

  const incomplete = entries.filter(({ row }) => !row.title || !row.artist)
  if (incomplete.length > 0) {
    console.warn(`\n${incomplete.length} disque(s) sans titre ou sans artiste exploitable :`)
    for (const { row } of incomplete.slice(0, 5)) {
      console.warn(`  #${row.discogs_id} ${row.artist} — ${row.title}`)
    }
  }

  const { data: existing, error } = await supabase
    .from("albums")
    .select("id, discogs_id, title, artist, year, cover, genres, format, position")
    .eq("list", "vinyl")

  if (error) throw new Error(`Lecture des vinyles impossible : ${error.message}`)

  const byDiscogsId = new Map(
    (existing ?? []).filter((row) => row.discogs_id !== null).map((row) => [Number(row.discogs_id), row]),
  )

  // Une requete par master : on ne date que ce qui sera reellement ecrit. Sur
  // une synchronisation de routine sans nouveaute, cela n'en coute aucune.
  await resolveOriginalYears(
    entries.filter(({ row }) => REFRESH || !byDiscogsId.has(Number(row.discogs_id))),
  )

  const rows = entries.map(({ row }) => row)
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
  // Sous `--limit`, la collection lue est partielle : rien ne peut etre declare
  // absent de Discogs sur cette base.
  const orphans =
    LIMIT === Infinity
      ? (existing ?? []).filter((row) => row.discogs_id !== null && !seen.has(Number(row.discogs_id)))
      : []
  // Les fiches sans `discogs_id` ont ete ajoutees a la main : jamais supprimees.
  const handmade = (existing ?? []).filter((row) => row.discogs_id === null).length

  console.log(`\n${rows.length} disques dans la collection`)
  console.log(`  ${toInsert.length} a ajouter`)
  console.log(`  ${updates.length} a completer${REFRESH ? " (mode --refresh)" : ""}`)
  console.log(`  ${orphans.length} retire(s) de Discogs${PRUNE ? " — seront supprimes" : " — conserves (--prune pour supprimer)"}`)
  if (handmade > 0) console.log(`  ${handmade} fiche(s) ajoutee(s) a la main, laissees intactes`)

  // Le plan complet n'est deroule qu'en simulation : c'est la qu'on relit les
  // correspondances avant d'ecrire quoi que ce soit.
  const preview = DRY_RUN ? Infinity : 10

  for (const row of toInsert.slice(0, preview)) {
    console.log(`  + ${row.artist} — ${row.title}${row.year ? ` (${row.year})` : ""} · ${row.format}`)
  }
  if (toInsert.length > preview) console.log(`  + … ${toInsert.length - preview} autres`)

  for (const { row, patch } of updates.slice(0, preview)) {
    console.log(`  ~ ${row.artist} — ${row.title} : ${Object.keys(patch).join(", ")}`)
  }
  if (updates.length > preview) console.log(`  ~ … ${updates.length - preview} autres`)

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
