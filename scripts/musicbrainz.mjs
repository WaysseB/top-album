/**
 * Annee de PREMIERE sortie d'un album, via MusicBrainz.
 *
 * Deezer ne connait que la date de l'edition a laquelle on est lie : pour
 * « Paranoid » il renvoie 1998, celle d'une reedition. MusicBrainz expose
 * le `first-release-date` du release-group, c'est-a-dire l'oeuvre elle-meme
 * independamment de ses reeditions.
 *
 * Le service impose une requete par seconde et un User-Agent identifiant.
 */

import { artistMatches, fold, MIN_SCORE, normalizeTitle, scoreCandidate, sleep } from "./deezer-match.mjs"

/** Cadence imposee par MusicBrainz : une requete par seconde, avec une marge. */
export const MB_DELAY_MS = 1300

const USER_AGENT = "TopAlbums/1.0 (projet personnel de classement d'albums)"

/** Editions paralleles : on cherche l'album studio d'origine. */
const EXCLUDED_SECONDARY = ["Live", "Compilation", "Remix", "DJ-mix", "Demo", "Mixtape/Street"]

/** Echappe les caracteres speciaux de la syntaxe Lucene employee par MusicBrainz. */
function escapeLucene(value) {
  return value.replace(/([+\-!(){}[\]^"~*?:\\/]|&&|\|\|)/g, "\\$1")
}

/**
 * MusicBrainz repond 503 (parfois 429) des qu'il juge la cadence trop
 * soutenue. Il demande alors simplement de reessayer plus tard : on patiente
 * de plus en plus longtemps plutot que d'abandonner l'album.
 */
const MAX_ATTEMPTS = 4

/** Appel de l'API, `path` relatif a /ws/2/ et sans `fmt`. */
async function mbGet(path) {
  const separator = path.includes("?") ? "&" : "?"
  const url = `https://musicbrainz.org/ws/2/${path}${separator}fmt=json`

  let lastStatus = 0
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await fetch(url, {
      headers: { accept: "application/json", "user-agent": USER_AGENT },
    })

    if (response.ok) return response.json()

    lastStatus = response.status
    if (response.status !== 503 && response.status !== 429) break

    await sleep(MB_DELAY_MS * 2 * attempt)
  }

  throw new Error(`MusicBrainz a repondu ${lastStatus}`)
}

export async function searchReleaseGroups(query) {
  const payload = await mbGet(`release-group?query=${encodeURIComponent(query)}&limit=25`)
  return Array.isArray(payload?.["release-groups"]) ? payload["release-groups"] : []
}

function creditedArtist(group) {
  return (group?.["artist-credit"] ?? []).map((credit) => credit?.name ?? "").join(" ")
}

/**
 * Annee d'origine, ou null si aucune correspondance fiable.
 * On exige un album studio du bon artiste, dont le titre correspond selon
 * les memes regles que pour Deezer.
 */
export async function findFirstReleaseYear(artist, title) {
  const cleanTitle = normalizeTitle(title)

  // Le nom d'artiste entre guillemets est parfois trop litteral :
  // `artist:"Alt-J (∆)"` ne rencontre pas « alt-J ». La seconde tentative
  // interroge le seul titre et s'en remet au filtrage par artiste.
  const attempts = [
    `artist:"${escapeLucene(artist)}" AND releasegroup:"${escapeLucene(cleanTitle)}"`,
    `releasegroup:"${escapeLucene(cleanTitle)}"`,
  ]

  for (const [index, query] of attempts.entries()) {
    if (index > 0) await sleep(MB_DELAY_MS)

    const candidates = (await searchReleaseGroups(query))
      .filter((group) => group?.["primary-type"] === "Album")
      .filter((group) => !(group?.["secondary-types"] ?? []).some((t) => EXCLUDED_SECONDARY.includes(t)))
      .filter((group) => artistMatches(artist, creditedArtist(group)))
      .map((group) => ({
        group,
        score: scoreCandidate(cleanTitle, group?.title),
        year: /^(\d{4})/.exec(group?.["first-release-date"] ?? "")?.[1] ?? null,
      }))
      .filter((c) => c.score >= MIN_SCORE && c.year)
      // A pertinence egale, la date la plus ancienne est l'originale.
      .sort((a, b) => b.score - a.score || Number(a.year) - Number(b.year))

    const best = candidates[0]
    if (best) {
      return { year: best.year, title: best.group.title, artist: creditedArtist(best.group) }
    }
  }

  return null
}

// ------------------------------------------------------------------
//  Pays de l'artiste
// ------------------------------------------------------------------

/**
 * Codes que MusicBrainz attribue a des zones qui ne sont pas des pays :
 * « Worldwide », « Europe ». Mieux vaut ne rien ecrire.
 */
const NOT_A_COUNTRY = new Set(["XW", "XE"])

function validCountry(code) {
  return typeof code === "string" && /^[A-Z]{2}$/.test(code) && !NOT_A_COUNTRY.has(code) ? code : null
}

/** Nom compare sans casse, accents ni article : « The Cure » rejoint « Cure ». */
function nameKey(name) {
  return fold(name).replace(/^the /, "")
}

/** Le pays porte par une zone, si c'en est un ou si elle est une subdivision. */
function countryOfArea(area) {
  return (
    validCountry(area?.["iso-3166-1-codes"]?.[0]) ??
    // « GB-ENG » : une subdivision designe son pays par son prefixe.
    validCountry(area?.["iso-3166-2-codes"]?.[0]?.slice(0, 2)) ??
    null
  )
}

const areaCountryCache = new Map()

/**
 * Remonte d'une ville a son pays : Aberdeen -> comte -> Washington -> Etats-Unis.
 * Chaque etage coute une requete ; le cache sert aux villes partagees.
 */
async function climbToCountry(areaId, depth = 0) {
  if (!areaId || depth > 5) return null
  if (areaCountryCache.has(areaId)) return areaCountryCache.get(areaId)

  await sleep(MB_DELAY_MS)
  const area = await mbGet(`area/${areaId}?inc=area-rels`)
  let country = countryOfArea(area)

  if (!country) {
    const parent = (area?.relations ?? []).find(
      (rel) => rel?.type === "part of" && rel?.direction === "backward",
    )?.area
    country = await climbToCountry(parent?.id, depth + 1)
  }

  areaCountryCache.set(areaId, country)
  return country
}

/**
 * Pays d'un artiste MusicBrainz.
 *
 * Le champ `country` suffit le plus souvent. A defaut, la zone de l'artiste
 * puis son lieu de naissance ou de formation, remontes jusqu'au pays.
 */
async function countryOfArtist(artist) {
  const direct = validCountry(artist?.country)
  if (direct) return direct

  await sleep(MB_DELAY_MS)
  const full = await mbGet(`artist/${artist.id}`)

  return (
    validCountry(full?.country) ??
    countryOfArea(full?.area) ??
    countryOfArea(full?.["begin-area"]) ??
    (await climbToCountry(full?.area?.id)) ??
    (await climbToCountry(full?.["begin-area"]?.id))
  )
}

/** Identifiants des artistes credites sur les albums de ce titre. */
async function creditedIds(cleanTitle, groups) {
  const ids = new Set()
  for (const group of groups) {
    if (scoreCandidate(cleanTitle, group?.title) < MIN_SCORE) continue
    for (const credit of group?.["artist-credit"] ?? []) {
      if (credit?.artist?.id) ids.add(credit.artist.id)
    }
  }
  return ids
}

/**
 * Celui des homonymes qui a publie cet album.
 *
 * Interroge par identifiant (`arid`) et non par nom : l'album credite souvent
 * l'artiste sous une autre graphie — « 近藤浩治 » pour Koji Kondo — qu'une
 * comparaison de noms rejetterait.
 */
async function homonymFromAlbum(homonyms, title) {
  const cleanTitle = normalizeTitle(title)
  const arids = homonyms.map((candidate) => `arid:${candidate.id}`).join(" OR ")
  const query = `releasegroup:"${escapeLucene(cleanTitle)}" AND (${arids})`

  const ids = await creditedIds(cleanTitle, await searchReleaseGroups(query))
  return homonyms.find((candidate) => ids.has(candidate.id)) ?? null
}

/** Artistes credites sur l'album, pour un nom qui n'en designe aucun. */
async function artistIdsFromAlbum(artist, title) {
  const cleanTitle = normalizeTitle(title)
  const query = `artist:"${escapeLucene(artist)}" AND releasegroup:"${escapeLucene(cleanTitle)}"`
  const groups = (await searchReleaseGroups(query)).filter((group) =>
    artistMatches(artist, creditedArtist(group)),
  )
  return creditedIds(cleanTitle, groups)
}

/**
 * Pays d'origine d'un artiste, ou null si l'on ne peut pas trancher.
 *
 * Recherche par nom d'abord : un nom porte par un seul artiste suffit, en une
 * requete. Les homonymes — il y a cinq Nirvana — sont departages par leurs
 * albums : celui qui est credite sur l'un des `titles` est le bon. Sans cette
 * preuve, on s'abstient plutot que de choisir le plus connu.
 *
 * Les albums servent aussi de repli quand le nom ne donne rien, ce qui est le
 * cas des collaborations : « Jay-Z & Kanye West » n'est pas un artiste, mais
 * son album credite les deux.
 */
export async function findArtistCountry(artist, titles) {
  const wanted = nameKey(artist)
  if (!wanted) return null

  // Les alias comptent autant que le nom : le compositeur de Mario est
  // enregistre sous « 近藤浩治 », et `artist:` seul ne remontait qu'un groupe
  // punk texan nomme Koji Kondo — seul, donc accepte sans verification. La
  // forme repliee rattrape les graphies que l'index ignore (« KoЯn »).
  const names = [...new Set([artist, fold(artist)])].map(escapeLucene)
  const query = names.flatMap((name) => [`artist:"${name}"`, `alias:"${name}"`]).join(" OR ")
  const payload = await mbGet(`artist?query=${encodeURIComponent(query)}&limit=25`)
  const homonyms = (payload?.artists ?? []).filter((candidate) =>
    [candidate?.name, candidate?.["sort-name"], ...(candidate?.aliases ?? []).map((a) => a?.name)].some(
      (name) => nameKey(name) === wanted,
    ),
  )

  if (homonyms.length === 1) {
    const country = await countryOfArtist(homonyms[0])
    return country ? { country, via: homonyms[0].name } : null
  }

  for (const title of titles.slice(0, 3)) {
    await sleep(MB_DELAY_MS)

    if (homonyms.length > 1) {
      const credited = await homonymFromAlbum(homonyms, title)
      if (!credited) continue
      const country = await countryOfArtist(credited)
      return country ? { country, via: `${credited.name}, d'apres « ${title} »` } : null
    }

    // Aucun artiste a ce nom : collaboration ou graphie differente. Le
    // premier credite de l'album fait foi.
    const [firstId] = await artistIdsFromAlbum(artist, title)
    if (!firstId) continue
    const country = await countryOfArtist({ id: firstId })
    return country ? { country, via: `credit de « ${title} »` } : null
  }

  return null
}

export { sleep }
