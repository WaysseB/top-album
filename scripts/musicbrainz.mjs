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

import { artistMatches, MIN_SCORE, normalizeTitle, scoreCandidate, sleep } from "./deezer-match.mjs"

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

export async function searchReleaseGroups(query) {
  const url = `https://musicbrainz.org/ws/2/release-group?query=${encodeURIComponent(query)}&fmt=json&limit=25`

  let lastStatus = 0
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await fetch(url, {
      headers: { accept: "application/json", "user-agent": USER_AGENT },
    })

    if (response.ok) {
      const payload = await response.json()
      return Array.isArray(payload?.["release-groups"]) ? payload["release-groups"] : []
    }

    lastStatus = response.status
    if (response.status !== 503 && response.status !== 429) break

    await sleep(MB_DELAY_MS * 2 * attempt)
  }

  throw new Error(`MusicBrainz a repondu ${lastStatus}`)
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

export { sleep }
