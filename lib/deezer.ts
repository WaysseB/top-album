export type DeezerType = "album" | "track" | "playlist"

export type DeezerRef = {
  type: DeezerType
  id: string
}

const TYPES: DeezerType[] = ["album", "track", "playlist"]

// Les identifiants Deezer sont des entiers.
const ID_RE = /^\d+$/

/**
 * Extrait le type et l'identifiant d'une URL Deezer.
 *
 * Formes acceptees :
 *   https://www.deezer.com/album/302127
 *   https://www.deezer.com/fr/album/302127?utm_source=...
 *   https://deezer.com/track/3135556
 *   deezer.com/fr/playlist/1234        (sans protocole)
 *
 * Renvoie null pour tout le reste — notamment les liens courts
 * deezer.page.link/... qui exigeraient un appel reseau pour etre resolus.
 */
export function parseDeezerRef(input: string | null | undefined): DeezerRef | null {
  const raw = (input ?? "").trim()
  if (!raw) return null

  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return null
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null

  const host = url.hostname.toLowerCase().replace(/^www\./, "")
  if (host !== "deezer.com") return null

  // Le chemin peut porter un prefixe de langue : /fr/album/302127
  const segments = url.pathname.split("/").filter(Boolean)
  const typeIndex = segments.findIndex((segment) => TYPES.includes(segment as DeezerType))
  if (typeIndex === -1) return null

  const type = segments[typeIndex] as DeezerType
  const id = segments[typeIndex + 1]
  if (!id || !ID_RE.test(id)) return null

  return { type, id }
}

/**
 * URL du lecteur integre.
 *
 * Volontairement reconstruite a partir du type et de l'identifiant : l'adresse
 * saisie par l'utilisateur n'est jamais transmise telle quelle a l'iframe.
 */
export function deezerWidgetUrl(ref: DeezerRef): string {
  const tracklist = ref.type === "track" ? "false" : "true"
  return `https://widget.deezer.com/widget/dark/${ref.type}/${ref.id}?tracklist=${tracklist}`
}

/** Hauteur du lecteur : compacte pour une piste seule, etendue avec la liste des pistes. */
export function deezerWidgetHeight(ref: DeezerRef): number {
  return ref.type === "track" ? 92 : 300
}

/** URL publique normalisee, pour le lien « ouvrir sur Deezer ». */
export function deezerPageUrl(ref: DeezerRef): string {
  return `https://www.deezer.com/${ref.type}/${ref.id}`
}
