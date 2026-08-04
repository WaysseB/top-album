"use client"

import type React from "react"

import { useEffect, useState } from "react"
import type { Album } from "@/lib/albums"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"

type Props = {
  open: boolean
  initial?: Album | null
  onClose: () => void
  onSubmit: (data: Omit<Album, "id">) => void
}

const EMPTY = { title: "", artist: "", year: "", cover: "", note: "" }

export function AlbumForm({ open, initial, onClose, onSubmit }: Props) {
  const [form, setForm] = useState(EMPTY)

  useEffect(() => {
    if (open) {
      setForm(
        initial
          ? {
              title: initial.title,
              artist: initial.artist,
              year: initial.year,
              cover: initial.cover,
              note: initial.note ?? "",
            }
          : EMPTY,
      )
    }
  }, [open, initial])

  if (!open) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim() || !form.artist.trim()) return
    onSubmit({
      title: form.title.trim(),
      artist: form.artist.trim(),
      year: form.year.trim(),
      cover: form.cover.trim(),
      note: form.note.trim() || undefined,
    })
    onClose()
  }

  const field =
    "w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none ring-ring placeholder:text-muted-foreground focus-visible:ring-2"

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={initial ? "Modifier l'album" : "Ajouter un album"}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground text-balance">
            {initial ? "Modifier l'album" : "Ajouter un album"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground outline-none ring-ring transition-colors hover:text-foreground focus-visible:ring-2"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="title" className="text-xs font-medium text-muted-foreground">
              Titre de l&apos;album *
            </label>
            <input
              id="title"
              className={field}
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Ex. In Rainbows"
              autoFocus
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="artist" className="text-xs font-medium text-muted-foreground">
              Artiste *
            </label>
            <input
              id="artist"
              className={field}
              value={form.artist}
              onChange={(e) => setForm((f) => ({ ...f, artist: e.target.value }))}
              placeholder="Ex. Radiohead"
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-1 flex flex-col gap-1.5">
              <label htmlFor="year" className="text-xs font-medium text-muted-foreground">
                Année
              </label>
              <input
                id="year"
                className={field}
                value={form.year}
                onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
                placeholder="2007"
                inputMode="numeric"
              />
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <label htmlFor="cover" className="text-xs font-medium text-muted-foreground">
                URL de la pochette
              </label>
              <input
                id="cover"
                className={field}
                value={form.cover}
                onChange={(e) => setForm((f) => ({ ...f, cover: e.target.value }))}
                placeholder="https://..."
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="note" className="text-xs font-medium text-muted-foreground">
              Note personnelle
            </label>
            <textarea
              id="note"
              className={`${field} resize-none`}
              rows={2}
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="Pourquoi cet album compte pour vous…"
            />
          </div>

          <div className="mt-1 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit">{initial ? "Enregistrer" : "Ajouter"}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
