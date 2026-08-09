import { Suspense, type ReactNode } from "react"
import { BackToTop } from "@/components/back-to-top"
import { CollectionProvider } from "@/components/collection-context"
import { CollectionSkeleton } from "@/components/collection-skeleton"
import { ErrorPanel } from "@/components/error-panel"
import { isAdmin } from "@/lib/auth/session"
import { countByList, listAlbums } from "@/lib/supabase/albums"
import { isSupabaseConfigured } from "@/lib/supabase/server"

/** Les listes sont lues a chaque requete : aucun rendu statique possible. */
export const dynamic = "force-dynamic"

/**
 * Charge la collection une fois pour les quatre onglets et les statistiques.
 *
 * Ce composant est separe du layout pour une raison precise : une frontiere de
 * suspense ne suspend que ce qu'elle contient. Un `loading.tsx` place a cote du
 * layout envelopperait ses enfants, pas son `await` — l'ossature ne s'afficherait
 * jamais, puisque le layout bloque avant de les rendre.
 */
async function Collection({ children }: { children: ReactNode }) {
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
        {/*
          Cache de la zone systeme.

          `viewportFit: 'cover'` fait courir la page sous la barre d'etat : au
          defilement, les pochettes passaient derriere l'heure et la batterie.
          Cette bande fixe les masque avec la couleur de fond.

          Elle ne coute aucune hauteur dans le flux, et sa hauteur vaut zero sur
          un ecran sans encoche. Elle passe au-dessus de la barre de filtres
          (z-30) mais sous les modales (z-50), qui gerent leur propre marge.
        */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 top-0 z-40 h-[env(safe-area-inset-top)] bg-background"
        />

        {children}
        {/* Monte ici plutot que dans chaque vue : il sert aux quatre listes
            comme a la page de statistiques, toutes longues a parcourir. */}
        <BackToTop />
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

export default function CollectionLayout({ children }: { children: ReactNode }) {
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

  // Le squelette part immediatement ; les donnees arrivent en flux ensuite.
  return (
    <Suspense fallback={<CollectionSkeleton />}>
      <Collection>{children}</Collection>
    </Suspense>
  )
}
