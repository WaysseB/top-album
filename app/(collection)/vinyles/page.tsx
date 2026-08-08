import type { Metadata } from "next"
import { AlbumsView } from "@/components/albums-view"

export const metadata: Metadata = {
  title: "Mes vinyles",
}

export default function Page() {
  return <AlbumsView list="vinyl" />
}
