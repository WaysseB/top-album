import { AlbumsPage } from "@/components/albums-page"

// Le classement est lu en base a chaque requete : pas de pre-rendu statique
// (qui echouerait au build, avant que les variables Supabase soient injectees).
export const dynamic = "force-dynamic"

export default function Page() {
  return <AlbumsPage list="top" />
}
