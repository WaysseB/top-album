"use client"

import { createContext, useContext, type ReactNode } from "react"
import type { Album, AlbumList, ListCounts } from "@/lib/albums"

export type Collection = {
  albumsByList: Record<AlbumList, Album[]>
  counts: ListCounts
  isAdmin: boolean
}

const CollectionContext = createContext<Collection | null>(null)

/**
 * Rend la collection entiere disponible aux quatre onglets et a la page de
 * statistiques.
 *
 * Le chargement est fait par le layout qui les englobe : dans l'App Router, un
 * layout n'est pas re-execute quand on navigue entre des routes qui le
 * partagent. Passer d'un onglet a l'autre ne redemande donc plus les 388 albums
 * au serveur — c'est le meme objet, deja en memoire.
 *
 * `router.refresh()`, lui, ré-exécute le layout : une modification reste
 * repercutee sur toutes les listes.
 */
export function CollectionProvider({ value, children }: { value: Collection; children: ReactNode }) {
  return <CollectionContext.Provider value={value}>{children}</CollectionContext.Provider>
}

export function useCollection(): Collection {
  const collection = useContext(CollectionContext)
  if (!collection) {
    throw new Error("useCollection doit être utilisé sous un CollectionProvider.")
  }
  return collection
}
