import type { Metadata } from "next"
import { AlbumsPage } from "@/components/albums-page"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Mes vinyles",
}

export default function Page() {
  return <AlbumsPage list="vinyl" />
}
