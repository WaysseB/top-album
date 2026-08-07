/**
 * Pre-remplit la colonne `apple_music_url` via l'API de recherche iTunes.
 *
 *   node --env-file=.env.local scripts/fill-apple-links.mjs --dry-run --limit 10
 *   node --env-file=.env.local scripts/fill-apple-links.mjs
 *   node --env-file=.env.local scripts/fill-apple-links.mjs --force
 *
 * L'endpoint est libre et sans cle, mais bride aux alentours de 20 appels par
 * minute — d'ou une temporisation nettement plus longue que pour Deezer. Comptez
 * une douzaine de minutes pour 200 albums.
 *
 * Les regles de correspondance (repli des accents, rejet des editions live ou
 * karaoke, notation des titres) sont celles deja eprouvees sur Deezer : le
 * module est importe tel quel plutot que duplique.
 */

import { createClient } from "@supabase/supabase-js"
import { artistMatches, fold, MIN_SCORE, normalizeTitle, scoreCandidate, sleep } from "./deezer-match.mjs"

const DRY_RUN = process.argv.includes("--dry-run")
const FORCE = process.argv.includes("--force")
const LIMIT = (() => {
  const index = process.argv.indexOf("--limit")
  if (index === -1) return Infinity
  const value = Number.parseInt(process.argv[index + 1] ?? "", 10)
  return Number.isFinite(value) && value > 0 ? value : Infinity
})()

/** ~20 requetes/minute tolerees : on reste en dessous. */
const DELAY_MS = 3100
const MAX_ATTEMPTS = 4

/**
 * Vitrines interrogees, dans l'ordre. La francaise d'abord pour rester
 * coherent avec les liens deja en base ; l'americaine en repli, car certains
 * albums n'y figurent pas du tout (« Songs for the Deaf », par exemple).
 */
const STOREFRONTS = ["fr", "us"]

/**
 * La recherche iTunes classe par popularite, pas par pertinence : « The Dark
 * Side of the Moon » n'arrive qu'au 12e rang de sa propre requete. 50 resultats
 * suffisent, et cela ne coute pas une requete de plus.
 */
const PAGE_SIZE = 50

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

/**
 * iTunes repond 403 quand la cadence lui deplait : on patiente puis on reessaie
 * plutot que d'abandonner l'album.
 */
async function appleSearch(term, country) {
  const url =
    `https://itunes.apple.com/search?term=${encodeURIComponent(term)}` +
    `&entity=album&media=music&limit=${PAGE_SIZE}&country=${country}`

  let lastStatus = 0
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await fetch(url, { headers: { accept: "application/json" } })

    if (response.ok) {
      // L'API repond en `text/javascript` : on parse le corps nous-memes.
      const payload = JSON.parse(await response.text())
      return Array.isArray(payload?.results) ? payload.results : []
    }

    lastStatus = response.status
    if (response.status !== 403 && response.status !== 429 && response.status < 500) break

    await sleep(DELAY_MS * attempt)
  }

  throw new Error(`iTunes a repondu ${lastStatus}`)
}

/** `collectionViewUrl` traine un `?uo=4` de suivi : on ne garde que le chemin. */
function cleanUrl(raw) {
  try {
    const url = new URL(raw)
    url.search = ""
    url.hash = ""
    return url.toString()
  } catch {
    return null
  }
}

async function findAppleAlbum(artist, title) {
  const cleanTitle = normalizeTitle(title)

  // Vitrine francaise en priorite ; le repli sans ponctuation traite les cas
  // du type « N*E*R*D », qui casse la requete.
  const attempts = [
    { country: "fr", term: `${artist} ${cleanTitle}` },
    { country: "fr", term: `${fold(artist)} ${fold(cleanTitle)}` },
    { country: "us", term: `${artist} ${cleanTitle}` },
  ].filter(({ country }) => STOREFRONTS.includes(country))

  const seen = new Set()
  let best = null

  for (const { country, term } of attempts) {
    const key = `${country}:${term}`
    if (!term.trim() || seen.has(key)) continue
    seen.add(key)

    const candidates = (await appleSearch(term, country))
      .filter((r) => artistMatches(artist, r?.artistName ?? ""))
      .map((r) => ({ result: r, country, score: scoreCandidate(cleanTitle, r?.collectionName) }))
      .filter((r) => r.score >= MIN_SCORE && cleanUrl(r.result?.collectionViewUrl))
      .sort((a, b) => b.score - a.score)

    if (candidates[0] && (!best || candidates[0].score > best.score)) best = candidates[0]
    // Correspondance exacte : inutile d'interroger les vitrines suivantes.
    if (best?.score >= 100) break
    await sleep(DELAY_MS)
  }

  return best
    ? {
        url: cleanUrl(best.result.collectionViewUrl),
        artist: best.result.artistName,
        title: best.result.collectionName,
        country: best.country,
      }
    : null
}

const { data, error } = await supabase
  .from("albums")
  .select("id, list, position, title, artist, apple_music_url")
  .order("list", { ascending: true })
  .order("position", { ascending: true })

if (error) throw new Error(`Lecture impossible : ${error.message}`)

const candidates = data.filter((album) => FORCE || !album.apple_music_url)
const todo = LIMIT === Infinity ? candidates : candidates.slice(0, LIMIT)

const seconds = Math.round((todo.length * DELAY_MS) / 1000)
console.log(
  `${data.length} album(s), ${candidates.length} sans lien Apple Music` +
    (todo.length < candidates.length ? `, ${todo.length} traite(s) (--limit)` : "") +
    (DRY_RUN ? "  [DRY RUN : aucune ecriture]" : ""),
)
console.log(`duree estimee : ~${Math.floor(seconds / 60)} min ${seconds % 60} s\n`)

let matched = 0
const unmatched = []

for (const album of todo) {
  const where = `${album.list}#${album.position}`.padEnd(12)
  const who = `${album.artist} - ${album.title}`

  let hit = null
  try {
    hit = await findAppleAlbum(album.artist ?? "", album.title)
  } catch (err) {
    console.log(`ERR  ${where} ${who}\n       ${err instanceof Error ? err.message : err}`)
    unmatched.push(album)
    await sleep(DELAY_MS)
    continue
  }

  if (!hit) {
    console.log(`--   ${where} ${who}`)
    unmatched.push(album)
    await sleep(DELAY_MS)
    continue
  }

  const vitrine = hit.country === "fr" ? "" : `  [vitrine ${hit.country.toUpperCase()}]`
  console.log(`OK   ${where} ${who}\n       -> ${hit.artist} - ${hit.title}${vitrine}\n       ${hit.url}`)

  if (!DRY_RUN) {
    const { error: writeError } = await supabase
      .from("albums")
      .update({ apple_music_url: hit.url })
      .eq("id", album.id)

    if (writeError) {
      console.log(`       ecriture impossible : ${writeError.message}`)
      unmatched.push(album)
      await sleep(DELAY_MS)
      continue
    }
  }

  matched++
  await sleep(DELAY_MS)
}

console.log()
console.log(`${matched}/${todo.length} correspondance(s)${DRY_RUN ? " (rien ecrit)" : " enregistree(s)"}`)

if (unmatched.length) {
  console.log(`\n${unmatched.length} album(s) a completer a la main :`)
  for (const album of unmatched) {
    console.log(`  ${album.list}#${album.position}  ${album.artist} - ${album.title}`)
  }
}
