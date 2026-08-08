import { AlbumsView } from "@/components/albums-view"

// Les donnees viennent du layout : la page ne fait que designer l'onglet actif.
export default function Page() {
  return <AlbumsView list="top" />
}
