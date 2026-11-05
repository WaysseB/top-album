import { revalidatePath } from "next/cache"
import { runDiscogsSync } from "@/lib/discogs"

/**
 * Synchronisation Discogs quotidienne, declenchee par Vercel Cron (voir
 * `vercel.json`).
 *
 * Discogs n'offre aucun webhook : c'est donc le site qui va regarder, chaque
 * jour, si la collection a change.
 *
 * Vercel envoie `Authorization: Bearer <CRON_SECRET>` quand la variable est
 * definie sur le projet. Sans elle, la route refuse tout : n'importe qui
 * pourrait sinon declencher des ecritures et consommer le quota Discogs.
 */

// Voir MAX_NEW_PER_RUN dans `lib/discogs.ts` : vingt ajouts tiennent dans la minute.
export const maxDuration = 60

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Non autorisé.", { status: 401 })
  }

  try {
    const summary = await runDiscogsSync()
    revalidatePath("/", "layout")
    return Response.json(summary)
  } catch (error) {
    console.error("[discogs] synchronisation planifiee", error)
    return Response.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 500 },
    )
  }
}
