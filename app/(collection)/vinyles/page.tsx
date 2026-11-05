import type { Metadata } from "next"
import { AlbumsView } from "@/components/albums-view"

export const metadata: Metadata = {
  title: "Mes vinyles",
}

/**
 * Duree accordee aux Server Actions de la page — dont la synchronisation
 * Discogs, qui interroge l'API a une requete par seconde.
 */
export const maxDuration = 60

export default function Page() {
  return <AlbumsView list="vinyl" />
}
