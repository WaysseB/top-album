"use client"

import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import type { Album, AlbumInput } from "@/lib/albums"
import {
  createAlbumAction,
  deleteAlbumAction,
  reorderAlbumsAction,
  updateAlbumAction,
  type ActionResult,
} from "@/app/actions"

function tempId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Etat du classement, synchronise avec Supabase.
 *
 * Les mutations sont appliquees immediatement en local (rendu optimiste) puis
 * confirmees par une Server Action. En cas d'echec, l'etat precedent est
 * restaure et le message d'erreur est expose via `error`.
 */
export function useAlbums(initial: Album[]) {
  const router = useRouter()
  const [albums, setAlbums] = useState<Album[]>(initial)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Reference toujours a jour, pour restaurer l'etat en cas d'echec.
  const albumsRef = useRef(albums)
  useEffect(() => {
    albumsRef.current = albums
  }, [albums])

  // Le serveur fait foi : chaque revalidation ecrase l'etat optimiste.
  useEffect(() => {
    setAlbums(initial)
  }, [initial])

  const mutate = useCallback(
    async (
      optimistic: (prev: Album[]) => Album[],
      action: () => Promise<ActionResult<unknown>>,
    ): Promise<boolean> => {
      const snapshot = albumsRef.current
      setAlbums(optimistic)

      const result = await action()
      if (!result.ok) {
        setAlbums(snapshot)
        setError(result.error)
        return false
      }

      setError(null)
      startTransition(() => router.refresh())
      return true
    },
    [router],
  )

  const addAlbum = useCallback(
    (data: AlbumInput) =>
      mutate(
        (prev) => [...prev, { ...data, id: tempId() }],
        () => createAlbumAction(data),
      ),
    [mutate],
  )

  const updateAlbum = useCallback(
    (id: string, data: AlbumInput) =>
      mutate(
        (prev) => prev.map((a) => (a.id === id ? { ...a, ...data } : a)),
        () => updateAlbumAction(id, data),
      ),
    [mutate],
  )

  const removeAlbum = useCallback(
    (id: string) =>
      mutate(
        (prev) => prev.filter((a) => a.id !== id),
        () => deleteAlbumAction(id),
      ),
    [mutate],
  )

  /**
   * Deplacement local pendant le glisser-deposer. Rien n'est envoye au serveur
   * ici : `persistOrder` s'en charge une seule fois, au relachement.
   */
  const reorder = useCallback((from: number, to: number) => {
    setAlbums((prev) => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) {
        return prev
      }
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }, [])

  const persistOrder = useCallback(async () => {
    const ids = albumsRef.current.map((a) => a.id)
    const result = await reorderAlbumsAction(ids)
    if (!result.ok) {
      setError(result.error)
      startTransition(() => router.refresh())
      return false
    }
    setError(null)
    startTransition(() => router.refresh())
    return true
  }, [router])

  return {
    albums,
    pending,
    error,
    clearError: useCallback(() => setError(null), []),
    addAlbum,
    updateAlbum,
    removeAlbum,
    reorder,
    persistOrder,
  }
}
