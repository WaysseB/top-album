import type { AlbumList } from "@/lib/albums"
import { AlbumsView } from "@/components/albums-view"
import { isAdmin } from "@/lib/auth/session"
import { countByList, listAlbums } from "@/lib/supabase/albums"
import { isSupabaseConfigured } from "@/lib/supabase/server"

function ErrorPanel({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md rounded-xl border border-destructive/50 bg-destructive/10 p-6">
        <h1 className="mb-2 text-lg font-semibold text-foreground text-balance">{title}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground text-pretty">{detail}</p>
      </div>
    </main>
  )
}

/**
 * Rendu serveur commun aux deux onglets : seule la liste change.
 */
export async function AlbumsPage({ list }: { list: AlbumList }) {
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
    // Toutes les listes sont chargees : la recherche porte sur l'ensemble.
    const [top, wannabe, ost, counts, admin] = await Promise.all([
      listAlbums("top"),
      listAlbums("wannabe"),
      listAlbums("ost"),
      countByList(),
      isAdmin(),
    ])
    return (
      <AlbumsView list={list} albumsByList={{ top, wannabe, ost }} counts={counts} isAdmin={admin} />
    )
  } catch (error) {
    console.error(`[albums] chargement de la liste ${list}`, error)
    return (
      <ErrorPanel
        title="Impossible de charger le classement"
        detail={error instanceof Error ? error.message : "Erreur Supabase inconnue."}
      />
    )
  }
}
