/**
 * Synchronisation de la collection Discogs vers la liste « vinyl ».
 *
 * Module partage, volontairement en JavaScript pur et sans import d'alias :
 * il sert a la fois au script `scripts/discogs-sync.mjs` (Node seul) et au
 * site (tache planifiee et bouton d'administration, via `lib/discogs.ts`).
 * Le client Supabase et la gestion des pochettes sont injectes par l'appelant.
 *
 * Cle de synchronisation : `instance_id`, l'identifiant de l'EXEMPLAIRE possede,
 * et non celui du pressage. Deux exemplaires du meme disque restent deux lignes,
 * ce qui est le comportement attendu pour une collection physique.
 *
 * Les fiches existantes ne sont completees que sur leurs champs vides : les
 * notes, titres preferes et liens d'ecoute saisis a la main survivent a une
 * resynchronisation. `refresh` force l'ecrasement par les donnees Discogs.
 *
 * L'annee enregistree est celle de la PREMIERE PARUTION, lue sur le « master »
 * Discogs — c'est la seule qui rende les statistiques comparables entre les
 * quatre listes. L'annee du pressage possede figure sur la ligne de support,
 * sous la forme « … · pressage 2016 », quand elle differe.
 */

const PER_PAGE = 100
const MAX_ATTEMPTS = 4

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Discogs impose un `User-Agent` explicite : sans lui, l'API repond 403.
 *
 * Le jeton est facultatif : une collection publique se lit anonymement. Il
 * devient necessaire si la collection passe en privee, et releve au passage le
 * quota de 25 a 60 requetes par minute.
 */
function discogsClient(username, token, log) {
  const headers = {
    "User-Agent": "MonTopAlbums/1.0 (+https://v0-topalbums.vercel.app)",
    Accept: "application/json",
    ...(token ? { Authorization: `Discogs token=${token}` } : {}),
  }

  async function get(url) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const response = await fetch(url, { headers, cache: "no-store" })
      if (response.ok) return response.json()

      // 429 : quota depasse. Discogs indique parfois le delai a respecter.
      if (response.status === 429 || response.status >= 500) {
        const wait = Number(response.headers.get("retry-after") ?? 0) * 1000 || attempt * 5000
        log.warn(`  HTTP ${response.status}, nouvelle tentative dans ${Math.round(wait / 1000)} s`)
        await sleep(wait)
        continue
      }

      if (response.status === 401 || response.status === 403) {
        throw new Error(
          token
            ? `Jeton Discogs refuse (${response.status}).`
            : `Collection Discogs privee (${response.status}) : renseignez DISCOGS_TOKEN.`,
        )
      }
      if (response.status === 404) throw new Error(`Collection Discogs introuvable pour « ${username} » (404).`)
      throw new Error(`Discogs a repondu ${response.status} sur ${url}`)
    }
    throw new Error(`Discogs injoignable apres ${MAX_ATTEMPTS} tentatives : ${url}`)
  }

  return { get, delayMs: token ? 1100 : 2500 }
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
export function formatSupport(formats) {
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
export function cleanTitle(title) {
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
 * Ne remplit que les champs vides, sauf en mode `refresh`.
 */
function buildUpdate(current, next, refresh) {
  const patch = {}
  const consider = (column, value) => {
    if (!value) return
    const existing = current[column]
    const empty = Array.isArray(existing) ? existing.length === 0 : !existing
    if (refresh || empty) {
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

/**
 * @typedef {Object} DiscogsSyncOptions
 * @property {boolean} [dryRun]      n'ecrit rien, affiche le plan
 * @property {boolean} [raw]         affiche la premiere reponse brute
 * @property {boolean} [prune]       supprime les vinyles retires de Discogs
 * @property {boolean} [refresh]     reapplique les donnees Discogs sur l'existant
 * @property {boolean} [allFormats]  inclut CD, cassettes et autres supports
 * @property {number}  [limit]       ne lit que les N premiers disques
 * @property {number}  [folder]      dossier Discogs (0 = collection entiere)
 * @property {number}  [maxNew]      plafond d'ajouts par execution
 */

/**
 * @typedef {Object} DiscogsSyncSummary
 * @property {number} total       disques retenus dans la collection
 * @property {number} skipped     exemplaires ecartes (support non vinyle)
 * @property {number} inserted    fiches ajoutees (ou a ajouter en simulation)
 * @property {number} updated     fiches completees
 * @property {number} orphans     fiches retirees de Discogs
 * @property {number} pruned      fiches supprimees
 * @property {number} remaining   ajouts reportes a la prochaine execution
 * @property {string[]} added     « Artiste — Titre » des fiches ajoutees
 * @property {boolean} dryRun
 */

/**
 * @param {Object} params
 * @param {import("@supabase/supabase-js").SupabaseClient} params.supabase  client service_role
 * @param {string} params.username
 * @param {string} [params.token]
 * @param {DiscogsSyncOptions} [params.options]
 * @param {{ log: (...a: unknown[]) => void, warn: (...a: unknown[]) => void, dir?: (v: unknown, o?: unknown) => void }} [params.logger]
 * @param {(url: string) => Promise<{ cover: string, cover_source: string | null }>} [params.prepareCover]
 *   Rapatrie une pochette avant ecriture. Absent, l'URL Discogs est stockee
 *   telle quelle (`scripts/backfill-covers.mjs` repassera derriere).
 * @returns {Promise<DiscogsSyncSummary>}
 */
export async function syncDiscogs({ supabase, username, token, options = {}, logger = console, prepareCover }) {
  const {
    dryRun = false,
    raw = false,
    prune = false,
    refresh = false,
    allFormats = false,
    limit = Infinity,
    folder = 0,
    maxNew = Infinity,
  } = options

  if (!username) throw new Error("DISCOGS_USERNAME n'est pas renseigne.")

  // `limit` tronque la collection lue : tout ce qui suit passerait pour retire
  // de Discogs, et `prune` le supprimerait. Les deux ne vont pas ensemble.
  if (prune && limit !== Infinity) {
    throw new Error("--prune et --limit sont incompatibles : la collection tronquee ferait passer le reste pour supprime.")
  }

  const log = (...args) => logger.log(...args)
  const warn = (...args) => logger.warn(...args)
  const discogs = discogsClient(username, token, logger)

  /** Parcourt toutes les pages de la collection. */
  async function fetchCollection() {
    const items = []
    let page = 1
    let pages = 1

    while (page <= pages && items.length < limit) {
      const url =
        `https://api.discogs.com/users/${encodeURIComponent(username)}/collection/folders/${folder}` +
        `/releases?page=${page}&per_page=${PER_PAGE}&sort=artist&sort_order=asc`

      const payload = await discogs.get(url)

      if (raw && page === 1) {
        log("\nPremier element brut :")
        if (logger.dir) logger.dir(payload.releases?.[0], { depth: 4 })
        else log(JSON.stringify(payload.releases?.[0], null, 2))
        log()
      }

      pages = payload.pagination?.pages ?? 1
      const batch = payload.releases ?? []
      items.push(...batch)
      log(`  page ${page}/${pages} — ${batch.length} disques (${items.length} au total)`)

      page += 1
      if (page <= pages) await sleep(discogs.delayMs)
    }

    return items.slice(0, limit === Infinity ? undefined : limit)
  }

  /**
   * Remplace l'annee du pressage par celle de la premiere parution, lue sur le
   * « master » Discogs.
   *
   * Sans cela, une reedition 2016 du « Dark Side of the Moon » se compte dans
   * les annees 2010 : les statistiques melangent les quatre listes, et le Top
   * est date, lui, a la premiere parution. L'annee du pressage n'est pas perdue
   * pour autant, elle rejoint la ligne de support.
   *
   * Une requete par master, d'ou l'appel restreint aux fiches reellement ecrites.
   */
  async function resolveOriginalYears(entries) {
    const targets = entries.filter((entry) => entry.masterId)
    if (targets.length > 0) {
      log(`\nAnnees de parution originale : ${targets.length} master(s) a interroger…`)
    }
    const cache = new Map()
    let resolved = 0

    for (const [index, entry] of targets.entries()) {
      let year = cache.get(entry.masterId)

      if (year === undefined) {
        const master = await discogs.get(`https://api.discogs.com/masters/${entry.masterId}`)
        year = parseYear(master.year)
        cache.set(entry.masterId, year)
        if (index < targets.length - 1) await sleep(discogs.delayMs)
      }

      if (year) {
        entry.row.year = year
        resolved += 1
      }

      if ((index + 1) % 25 === 0) log(`  ${index + 1}/${targets.length}`)
    }

    // Le pressage se lit alors sur la ligne de support, et seulement quand il
    // differe de la parution — sinon l'information ferait doublon.
    for (const entry of entries) {
      if (entry.pressingYear && entry.pressingYear !== entry.row.year) {
        entry.row.format = `${entry.support} · pressage ${entry.pressingYear}`.slice(0, 500)
      }
    }

    if (targets.length > 0) {
      const fallback = entries.length - resolved
      log(`  ${resolved} datee(s) a la parution originale, ${fallback} au pressage faute de master.`)
    }
  }

  log(`Collection Discogs de « ${username} », dossier ${folder}`)
  if (dryRun) log("Mode --dry-run : aucune ecriture.\n")

  const summary = {
    total: 0,
    skipped: 0,
    inserted: 0,
    updated: 0,
    orphans: 0,
    pruned: 0,
    remaining: 0,
    added: [],
    dryRun,
  }

  const all = await fetchCollection()
  if (all.length === 0) {
    log("\nCollection vide — rien a faire.")
    return summary
  }

  // La collection Discogs peut contenir des CD ou des cassettes : cette liste-ci
  // ne montre que les disques.
  const items = allFormats ? all : all.filter((item) => isVinyl(item.basic_information ?? {}))
  summary.skipped = all.length - items.length
  if (summary.skipped > 0) {
    log(`\n${summary.skipped} exemplaire(s) ecarte(s), support non vinyle (--all-formats pour les inclure) :`)
    for (const item of all.filter((i) => !isVinyl(i.basic_information ?? {})).slice(0, 10)) {
      const basic = item.basic_information ?? {}
      log(`  · ${cleanTitle(basic.title)} — ${formatSupport(basic.formats)}`)
    }
  }

  const entries = items.map(toEntry)

  const incomplete = entries.filter(({ row }) => !row.title || !row.artist)
  if (incomplete.length > 0) {
    warn(`\n${incomplete.length} disque(s) sans titre ou sans artiste exploitable :`)
    for (const { row } of incomplete.slice(0, 5)) {
      warn(`  #${row.discogs_id} ${row.artist} — ${row.title}`)
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
  const isKnown = (entry) => byDiscogsId.has(Number(entry.row.discogs_id))

  // Plafond d'ajouts : sur le site, une execution doit tenir dans la duree
  // accordee a la fonction. Le reste attend l'execution suivante — rien n'est
  // perdu, ces disques seront toujours absents de la base.
  const fresh = entries.filter((entry) => !isKnown(entry))
  const admitted = fresh.slice(0, maxNew)
  summary.remaining = fresh.length - admitted.length

  // Une requete par master : on ne date que ce qui sera reellement ecrit. Sur
  // une synchronisation de routine sans nouveaute, cela n'en coute aucune.
  await resolveOriginalYears([...admitted, ...(refresh ? entries.filter(isKnown) : [])])

  const toInsert = admitted.map(({ row }) => row)
  const updates = entries
    .filter(isKnown)
    .map(({ row }) => {
      const current = byDiscogsId.get(Number(row.discogs_id))
      const patch = buildUpdate(current, row, refresh)
      return Object.keys(patch).length > 0 ? { id: current.id, row, patch } : null
    })
    .filter(Boolean)

  const seen = new Set(entries.map(({ row }) => Number(row.discogs_id)))
  // Sous `limit`, la collection lue est partielle : rien ne peut etre declare
  // absent de Discogs sur cette base.
  const orphans =
    limit === Infinity
      ? (existing ?? []).filter((row) => row.discogs_id !== null && !seen.has(Number(row.discogs_id)))
      : []
  // Les fiches sans `discogs_id` ont ete ajoutees a la main : jamais supprimees.
  const handmade = (existing ?? []).filter((row) => row.discogs_id === null).length

  summary.total = entries.length
  summary.orphans = orphans.length

  log(`\n${entries.length} disques dans la collection`)
  log(`  ${toInsert.length} a ajouter${summary.remaining > 0 ? ` (${summary.remaining} reporte(s) a la prochaine execution)` : ""}`)
  log(`  ${updates.length} a completer${refresh ? " (mode --refresh)" : ""}`)
  log(`  ${orphans.length} retire(s) de Discogs${prune ? " — seront supprimes" : " — conserves (--prune pour supprimer)"}`)
  if (handmade > 0) log(`  ${handmade} fiche(s) ajoutee(s) a la main, laissees intactes`)

  // Le plan complet n'est deroule qu'en simulation : c'est la qu'on relit les
  // correspondances avant d'ecrire quoi que ce soit.
  const preview = dryRun ? Infinity : 10

  for (const row of toInsert.slice(0, preview)) {
    log(`  + ${row.artist} — ${row.title}${row.year ? ` (${row.year})` : ""} · ${row.format}`)
  }
  if (toInsert.length > preview) log(`  + … ${toInsert.length - preview} autres`)

  for (const { row, patch } of updates.slice(0, preview)) {
    log(`  ~ ${row.artist} — ${row.title} : ${Object.keys(patch).join(", ")}`)
  }
  if (updates.length > preview) log(`  ~ … ${updates.length - preview} autres`)

  for (const row of orphans.slice(0, 10)) log(`  - ${row.artist} — ${row.title}`)

  summary.added = toInsert.map((row) => `${row.artist} — ${row.title}`)

  if (dryRun) {
    summary.inserted = toInsert.length
    summary.updated = updates.length
    log("\nRien n'a ete ecrit.")
    return summary
  }

  /** Pochette prete a l'ecriture : rapatriee si l'appelant sait le faire. */
  const coverColumns = async (url) => {
    if (!url || !prepareCover) return { cover: url }
    return prepareCover(url)
  }

  if (toInsert.length > 0) {
    // La liste s'affiche par ordre alphabetique : `position` n'est la que pour
    // satisfaire la colonne, d'ou une simple numerotation a la suite.
    const maxPosition = Math.max(0, ...(existing ?? []).map((row) => row.position ?? 0))
    const payload = []
    for (const [index, row] of toInsert.entries()) {
      payload.push({
        ...row,
        ...(await coverColumns(row.cover)),
        genres: row.genres.length ? row.genres : null,
        position: maxPosition + index + 1,
      })
    }

    const { error: insertError } = await supabase.from("albums").insert(payload)
    if (insertError) throw new Error(`Ajout impossible : ${insertError.message}`)
    summary.inserted = toInsert.length
    log(`\n${toInsert.length} vinyle(s) ajoute(s).`)
  }

  for (const { id, patch } of updates) {
    const columns = patch.cover ? { ...patch, ...(await coverColumns(patch.cover)) } : patch
    const { error: updateError } = await supabase.from("albums").update(columns).eq("id", id)
    if (updateError) throw new Error(`Mise a jour impossible : ${updateError.message}`)
    summary.updated += 1
  }
  if (updates.length > 0) log(`${updates.length} fiche(s) completee(s).`)

  if (prune && orphans.length > 0) {
    const { error: deleteError } = await supabase
      .from("albums")
      .delete()
      .in("id", orphans.map((row) => row.id))

    if (deleteError) throw new Error(`Suppression impossible : ${deleteError.message}`)
    summary.pruned = orphans.length
    log(`${orphans.length} vinyle(s) supprime(s).`)
  }

  log("\nSynchronisation terminee.")
  return summary
}
