import { AlbumsView } from "@/components/albums-view"
import { listAlbums } from "@/lib/supabase/albums"
import { isSupabaseConfigured } from "@/lib/supabase/server"

// Le classement est lu en base a chaque requete : pas de pre-rendu statique
// (qui echouerait au build, avant que les variables Supabase soient injectees).
export const dynamic = "force-dynamic"

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

export default async function Page() {
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
    const albums = await listAlbums()
    return <AlbumsView initialAlbums={albums} />
  } catch (error) {
    console.error("[albums] chargement initial", error)
    return (
      <ErrorPanel
        title="Impossible de charger le classement"
        detail={error instanceof Error ? error.message : "Erreur Supabase inconnue."}
      />
    )
  }
}
