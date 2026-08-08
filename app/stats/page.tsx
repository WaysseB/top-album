import type { Metadata } from "next"
import { StatsView } from "@/components/stats-view"
import { countByList, listAlbums } from "@/lib/supabase/albums"
import { isSupabaseConfigured } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Statistiques",
}

export default async function Page() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <p className="max-w-md rounded-xl border border-destructive/50 bg-destructive/10 p-6 text-sm text-muted-foreground">
          Supabase n&apos;est pas configuré : les statistiques ne peuvent pas être calculées.
        </p>
      </main>
    )
  }

  // Tout est charge puis agrege cote client : a l'echelle de quelques centaines
  // d'albums, cela evite sept requetes d'agregation et rend le selecteur de
  // perimetre instantane.
  const [top, wannabe, ost, counts] = await Promise.all([
    listAlbums("top"),
    listAlbums("wannabe"),
    listAlbums("ost"),
    countByList(),
  ])

  return <StatsView albumsByList={{ top, wannabe, ost }} counts={counts} />
}
