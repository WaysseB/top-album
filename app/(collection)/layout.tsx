import type { ReactNode } from "react"
import { CollectionProvider } from "@/components/collection-context"
import { ErrorPanel } from "@/components/error-panel"
import { isAdmin } from "@/lib/auth/session"
import { countByList, listAlbums } from "@/lib/supabase/albums"
import { isSupabaseConfigured } from "@/lib/supabase/server"

/** Les listes sont lues a chaque requete : aucun rendu statique possible. */
export const dynamic = "force-dynamic"

/**
 * Charge la collection une fois pour les quatre onglets et les statistiques.
 *
 * Ce layout est volontairement au-dessus des pages plutot que dans chacune
 * d'elles : la recherche porte sur toutes les listes, donc chaque page avait
 * besoin de tout, et rechargeait 205 Ko a chaque changement d'onglet. Ici, le
 * layout est conserve d'une navigation a l'autre et le chargement n'a lieu
 * qu'une fois.
 */
export default async function CollectionLayout({ children }: { children: ReactNode }) {
  if (!isSupabaseConfigured()) {
    return (
      <ErrorPanel
        title="Supabase n'est pas configuré"
        detail={
          "Les variables NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY sont absentes. " +
          "En local, récupérez-les depuis Vercel avec : npx vercel env pull .env.local"
        }
      />
    )
  }

  try {
    const [top, wannabe, ost, vinyl, counts, admin] = await Promise.all([
      listAlbums("top"),
      listAlbums("wannabe"),
      listAlbums("ost"),
      listAlbums("vinyl"),
      countByList(),
      isAdmin(),
    ])

    return (
      <CollectionProvider
        value={{ albumsByList: { top, wannabe, ost, vinyl }, counts, isAdmin: admin }}
      >
        {children}
      </CollectionProvider>
    )
  } catch (error) {
    console.error("[albums] chargement de la collection", error)
    return (
      <ErrorPanel
        title="Impossible de charger la collection"
        detail={error instanceof Error ? error.message : "Erreur Supabase inconnue."}
      />
    )
  }
}
