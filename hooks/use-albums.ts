"use client"

import { useCallback, useEffect, useState } from "react"
import { type Album, makeId, SEED_ALBUMS, STORAGE_KEY } from "@/lib/albums"

export function useAlbums() {
  const [albums, setAlbums] = useState<Album[]>([])
  const [loaded, setLoaded] = useState(false)

  // Load once on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        setAlbums(JSON.parse(raw))
      } else {
        setAlbums(SEED_ALBUMS)
      }
    } catch {
      setAlbums(SEED_ALBUMS)
    }
    setLoaded(true)
  }, [])

  // Persist on change (after initial load)
  useEffect(() => {
    if (!loaded) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(albums))
    } catch {
      // storage unavailable, ignore
    }
  }, [albums, loaded])

  const addAlbum = useCallback((data: Omit<Album, "id">) => {
    setAlbums((prev) => [...prev, { ...data, id: makeId() }])
  }, [])

  // Bulk import (e.g. from a Topsters file). When `replace` is true the
  // current list is discarded, otherwise imported albums are appended.
  const importAlbums = useCallback((incoming: Omit<Album, "id">[], replace = false) => {
    const withIds = incoming.map((a) => ({ ...a, id: makeId() }))
    setAlbums((prev) => (replace ? withIds : [...prev, ...withIds]))
  }, [])

  const updateAlbum = useCallback((id: string, data: Omit<Album, "id">) => {
    setAlbums((prev) => prev.map((a) => (a.id === id ? { ...a, ...data } : a)))
  }, [])

  const removeAlbum = useCallback((id: string) => {
    setAlbums((prev) => prev.filter((a) => a.id !== id))
  }, [])

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

  return { albums, loaded, addAlbum, importAlbums, updateAlbum, removeAlbum, reorder }
}
