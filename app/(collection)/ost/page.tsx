import type { Metadata } from "next"
import { AlbumsView } from "@/components/albums-view"

export const metadata: Metadata = {
  title: "OST de jeux vidéo",
}

export default function Page() {
  return <AlbumsView list="ost" />
}
