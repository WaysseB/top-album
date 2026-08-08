import "server-only"

import { createHash } from "node:crypto"
import { supabaseWrite } from "@/lib/supabase/server"

export const COVER_BUCKET = "covers"

/**
 * Cote le plus long de la vignette stockee.
 *
 * La grille affiche les pochettes autour de 170 px sur telephone et 250 px sur
 * ecran large ; la fiche detail plafonne a 45 % de la hauteur. 500 px couvre ces
 * trois cas, retine comprise, pour une quarantaine de kilo-octets en WebP —
 * contre 100 a 200 Ko pour les originaux, dont certains font 1280 px de cote.
 */
const COVER_SIZE = 500
const COVER_QUALITY = 80

/** Au-dela, on renonce : ce n'est pas une pochette. */
const MAX_DOWNLOAD_BYTES = 12 * 1024 * 1024

/**
 * Delai maximum accorde au telechargement.
 *
 * L'ingestion se produit pendant l'enregistrement d'un album : un hote distant
 * en panne ne doit pas faire echouer l'ajout.
 */
const FETCH_TIMEOUT_MS = 8000

/** Une pochette deja rapatriee se reconnait a son URL. */
export function isHostedCover(url: string): boolean {
  return url.includes(`/storage/v1/object/public/${COVER_BUCKET}/`)
}

/**
 * Nom de fichier derive de l'URL source.
 *
 * Deux albums qui partagent la meme pochette partagent le meme fichier, et
 * relancer un rattrapage ne retelecharge rien.
 */
function objectName(sourceUrl: string): string {
  return `${createHash("sha256").update(sourceUrl).digest("hex").slice(0, 32)}.webp`
}

export function publicCoverUrl(name: string): string {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "")
  return `${base}/storage/v1/object/public/${COVER_BUCKET}/${name}`
}

async function download(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    // Certains hotes refusent les requetes sans navigateur declare.
    headers: { "User-Agent": "MonTopAlbums/1.0", Accept: "image/*" },
    referrer: "",
  })

  if (!response.ok) throw new Error(`HTTP ${response.status}`)

  const type = response.headers.get("content-type") ?? ""
  if (!type.startsWith("image/")) throw new Error(`type inattendu : ${type || "inconnu"}`)

  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.byteLength > MAX_DOWNLOAD_BYTES) throw new Error("image trop lourde")
  if (buffer.byteLength === 0) throw new Error("reponse vide")

  return buffer
}

export type CoverIngestion =
  | { ok: true; url: string; bytes: number; reused: boolean }
  | { ok: false; reason: string }

/**
 * Rapatrie une pochette distante dans Supabase Storage.
 *
 * Ne leve jamais : l'appelant enregistre l'URL distante telle quelle en cas
 * d'echec, quitte a la rattraper plus tard avec `scripts/backfill-covers.mjs`.
 * Perdre une optimisation est sans consequence, perdre un ajout d'album non.
 */
export async function ingestCover(sourceUrl: string): Promise<CoverIngestion> {
  if (!sourceUrl || isHostedCover(sourceUrl)) {
    return { ok: false, reason: "rien à rapatrier" }
  }

  const name = objectName(sourceUrl)
  const storage = supabaseWrite().storage.from(COVER_BUCKET)

  try {
    // Deja presente : on ne retelecharge pas.
    const { data: existing } = await storage.list("", { search: name, limit: 1 })
    if (existing?.some((file) => file.name === name)) {
      return { ok: true, url: publicCoverUrl(name), bytes: 0, reused: true }
    }

    const original = await download(sourceUrl)

    /**
     * `sharp` est charge ici, et non en tete de module.
     *
     * C'est une bibliotheque native volumineuse, et ce fichier est atteint par
     * la chaine d'import du layout : importe statiquement, elle etait chargee au
     * demarrage de chaque instance serveur — donc a chaque affichage de page —
     * alors qu'elle ne sert qu'a l'ajout ou la modification d'un album.
     */
    const { default: sharp } = await import("sharp")

    const webp = await sharp(original)
      // `withoutEnlargement` : une pochette deja petite n'est pas etiree.
      .resize(COVER_SIZE, COVER_SIZE, { fit: "cover", withoutEnlargement: true })
      .webp({ quality: COVER_QUALITY })
      .toBuffer()

    const { error } = await storage.upload(name, webp, {
      contentType: "image/webp",
      // Les pochettes sont immuables : leur nom depend de leur source.
      cacheControl: "31536000",
      upsert: true,
    })

    if (error) throw new Error(error.message)
    return { ok: true, url: publicCoverUrl(name), bytes: webp.byteLength, reused: false }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "erreur inconnue" }
  }
}
