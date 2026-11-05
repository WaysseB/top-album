import "server-only"

import { syncDiscogs, type DiscogsSyncSummary } from "@/lib/discogs-sync.mjs"
import { ingestCover } from "@/lib/covers"
import { supabaseWrite } from "@/lib/supabase/server"

export type { DiscogsSyncSummary }

/**
 * Ajouts par execution depuis le site.
 *
 * Chaque nouveau disque coute une requete Discogs (l'annee du master, a une
 * par seconde) et le rapatriement de sa pochette. Vingt tiennent largement
 * dans la minute accordee a la fonction ; au-dela, le reste attend
 * l'execution suivante. Un ajout de routine en compte un ou deux.
 */
const MAX_NEW_PER_RUN = 20

/**
 * Synchronisation lancee depuis le site : tache planifiee ou bouton admin.
 *
 * Mode prudent — ajoute les nouveaux disques et complete les champs vides,
 * sans jamais supprimer ni ecraser. Les modes `--prune` et `--refresh`
 * restent reserves au script, lance a la main apres un `--dry-run`.
 */
export async function runDiscogsSync(): Promise<DiscogsSyncSummary> {
  const username = process.env.DISCOGS_USERNAME?.trim()
  if (!username) {
    throw new Error("Synchronisation Discogs impossible : renseignez DISCOGS_USERNAME.")
  }

  return syncDiscogs({
    supabase: supabaseWrite(),
    username,
    token: process.env.DISCOGS_TOKEN?.trim() || undefined,
    options: { maxNew: MAX_NEW_PER_RUN },
    logger: {
      log: (...args: unknown[]) => console.log("[discogs]", ...args),
      warn: (...args: unknown[]) => console.warn("[discogs]", ...args),
    },
    // Comme a l'ajout depuis le formulaire : la pochette est rapatriee dans
    // Supabase Storage, et l'URL Discogs conservee si cela echoue.
    prepareCover: async (url: string) => {
      const result = await ingestCover(url)
      if (result.ok) return { cover: result.url, cover_source: url }
      console.warn(`[discogs] pochette non rapatriee (${result.reason}) : ${url}`)
      return { cover: url, cover_source: null }
    },
  })
}

/** « 2 vinyles ajoutés, 1 fiche complétée. » — pour le bouton d'administration. */
export function describeSync(summary: DiscogsSyncSummary): string {
  const parts: string[] = []
  if (summary.inserted > 0) {
    parts.push(`${summary.inserted} vinyle${summary.inserted > 1 ? "s" : ""} ajouté${summary.inserted > 1 ? "s" : ""}`)
  }
  if (summary.updated > 0) {
    parts.push(`${summary.updated} fiche${summary.updated > 1 ? "s" : ""} complétée${summary.updated > 1 ? "s" : ""}`)
  }

  let message = parts.length > 0 ? `Discogs : ${parts.join(", ")}.` : "Discogs : rien de nouveau."
  if (summary.remaining > 0) {
    message += ` ${summary.remaining} autre${summary.remaining > 1 ? "s" : ""} en attente, relancez la synchronisation.`
  }
  return message
}
