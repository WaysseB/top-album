/**
 * Recherche d'un album sur l'API publique de Deezer.
 *
 * Module isole du script d'ecriture pour pouvoir etre teste sans toucher
 * a Supabase.
 */

// L'API Deezer est permissive, mais rien ne justifie de la marteler.
export const DELAY_MS = 250

/** En dessous, on prefere ne rien ecrire et laisser l'album a completer a la main. */
export const MIN_SCORE = 25

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Lettres etrangeres employees pour leur ressemblance graphique.
 * Sans cette table, "KoЯn" (Я cyrillique) se replie en "ko n" et ne
 * rencontre jamais "Korn".
 */
const HOMOGLYPHS = {
  я: "r",
  ѕ: "s",
  і: "i",
  ο: "o",
  α: "a",
  ε: "e",
  ν: "v",
  μ: "m",
  "0": "o",
}

/** Retire les mentions d'edition entre parentheses ou crochets. */
export function stripEditions(title) {
  return title
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Les titres viennent de Topsters et portent des suffixes qui font echouer
 * la recherche exacte : "(Original Album) Disc 1", "(2014 Remaster)",
 * "08 Koi No Yokan"...
 */
export function normalizeTitle(title) {
  return stripEditions(title)
    .replace(/\b(disc|disque|cd)\s*\d+\b/gi, " ")
    .replace(/^\s*\d{1,2}[.\s]+/, "")
    .replace(/\s*[-–—]\s*(remaster(ed)?|deluxe|edition|anniversary).*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Comparaison tolerante : casse, accents, homoglyphes et ponctuation ignores.
 * NFD separe les accents de leur lettre, `\p{M}` retire les signes combinants
 * ainsi liberes — sans quoi deux graphies d'un meme nom ne se rencontreraient pas.
 */
export function fold(value) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[Ѐ-ӿͰ-Ͽ0]/g, (c) => HOMOGLYPHS[c] ?? c)
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

/**
 * Mentions qui signalent une edition parallele. Deezer les remonte
 * volontiers en tete : sans ce garde-fou, "Paranoid" ramene le live,
 * "Disintegration" une captation, et "Abbey Road" une reprise au ukulele.
 */
const ALTERNATE_EDITION = [
  "live",
  "concert",
  "unplugged",
  "karaoke",
  "tribute",
  "instrumental",
  "remix",
  "acoustic",
  "ukulele",
  "best of",
  "very best",
  "greatest hits",
  "made famous",
  "in the style of",
  "originally performed",
]

function hasAlternateMarker(folded) {
  return ALTERNATE_EDITION.some((marker) => folded.includes(marker))
}

function levenshtein(a, b) {
  if (a === b) return 0
  if (!a.length || !b.length) return Math.max(a.length, b.length)

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)

  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    previous = current
  }
  return previous[b.length]
}

/**
 * Tolere une coquille ou une variante d'espacement :
 * "Masters of Puppets" (faute de frappe) vs "Master of Puppets",
 * "De-Loused in the Comatorium" vs "Deloused in the Comatorium".
 */
function closeEnough(a, b) {
  const len = Math.max(a.length, b.length)
  if (len < 8) return false
  return levenshtein(a, b) <= (len >= 12 ? 2 : 1)
}

export function artistMatches(expected, found) {
  const a = fold(expected)
  const b = fold(found)
  if (!a || !b) return false

  // Reprises et karaokes : l'artiste porte la mention, pas l'album.
  if (hasAlternateMarker(b) && !hasAlternateMarker(a)) return false

  // `a.includes(b)` seulement : l'artiste trouve peut etre plus court que
  // l'attendu ("The Smashing Pumpkins" -> "Smashing Pumpkins"), jamais plus
  // long. Sans cette dissymetrie, "The Beatles" acceptait "The Beatles
  // Complete On Ukulele", et "Justice" acceptait "Speedy Justice".
  if (a === b || a.includes(b)) return true

  // Recouvrement de mots, pour les variantes de graphie.
  const wordsA = new Set(a.split(" "))
  const wordsB = b.split(" ")
  const shared = wordsB.filter((word) => wordsA.has(word)).length
  return shared / Math.max(wordsA.size, wordsB.length) >= 0.6
}

/**
 * Note un resultat par rapport au titre recherche.
 * Le premier resultat de Deezer n'est pas forcement l'album canonique.
 */
export function scoreCandidate(wantedTitle, candidateTitle) {
  const wantFull = fold(wantedTitle)
  const gotFull = fold(candidateTitle)
  if (!wantFull || !gotFull) return -Infinity

  // Une edition parallele non demandee n'est jamais le bon album.
  if (hasAlternateMarker(gotFull) && !hasAlternateMarker(wantFull)) return -Infinity

  // Comparaison sur les titres depouilles de leurs mentions d'edition :
  // "(What's The Story) Morning Glory?" doit rencontrer "Morning Glory?".
  const want = fold(stripEditions(wantedTitle)) || wantFull
  const got = fold(stripEditions(candidateTitle)) || gotFull

  if (got === want) return 100
  if (closeEnough(got, want)) return 90

  // Suffixe d'edition : penalite legere, sinon les titres a rallonge
  // legitimes seraient ecartes (cf. PetroDragonic).
  if (got.startsWith(`${want} `)) return 70 - (got.length - want.length) / 100

  // Deezer plus concis que Topsters.
  if (want.startsWith(`${got} `)) return 50 - (want.length - got.length) / 100

  // Le titre attendu est noye au milieu d'un autre : signal faible. C'est
  // ainsi que "De-Loused in the Comatorium" ramenait un inedit intitule
  // "Inertiatic ESP (Unfinished Original Recordings Of...)".
  if (got.includes(want)) return 20 - (got.length - want.length) / 20

  return -Infinity
}

export async function deezerSearch(query) {
  const url = `https://api.deezer.com/search/album?q=${encodeURIComponent(query)}&limit=10`
  const response = await fetch(url, { headers: { accept: "application/json" } })
  if (!response.ok) throw new Error(`Deezer a repondu ${response.status}`)

  const payload = await response.json()
  if (payload?.error) throw new Error(payload.error.message ?? "erreur Deezer")
  return Array.isArray(payload?.data) ? payload.data : []
}

/**
 * Recherche structuree, puis repli sur une requete libre, puis sur une
 * requete depouillee de sa ponctuation ("N*E*R*D" casse la recherche Deezer).
 * Le meilleur candidat de chaque tentative est conserve : la recherche
 * structuree renvoie parfois zero resultat de facon intermittente.
 */
export async function findAlbum(artist, title) {
  const cleanTitle = normalizeTitle(title)

  const attempts = [
    `artist:"${artist}" album:"${cleanTitle}"`,
    `${artist} ${cleanTitle}`,
    `${fold(artist)} ${fold(cleanTitle)}`,
  ]

  const seen = new Set()
  let best = null

  for (const query of attempts) {
    if (!query.trim() || seen.has(query)) continue
    seen.add(query)

    const candidates = (await deezerSearch(query))
      .filter((r) => artistMatches(artist, r?.artist?.name ?? ""))
      .map((r) => ({ album: r, score: scoreCandidate(cleanTitle, r?.title) }))
      .filter((r) => r.score >= MIN_SCORE && r.album?.link)
      .sort((a, b) => b.score - a.score)

    if (candidates[0] && (!best || candidates[0].score > best.score)) {
      best = candidates[0]
    }

    // Correspondance exacte : inutile d'insister.
    if (best?.score >= 100) break
    await sleep(DELAY_MS)
  }

  return best?.album ?? null
}
