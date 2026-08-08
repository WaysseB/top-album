import type { Metadata } from "next"
import { StatsView } from "@/components/stats-view"

export const metadata: Metadata = {
  title: "Statistiques",
}

// Les statistiques sont calculees a partir de la collection deja chargee par le
// layout : arriver ici depuis un onglet ne coute aucune requete.
export default function Page() {
  return <StatsView />
}
