"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { formatGenres, LIST_TAB_LABELS, parseGenres, type Album, type AlbumInput, type AlbumList } from "@/lib/albums"
import { Button } from "@/components/ui/button"
import { useModal } from "@/hooks/use-modal"
import { parseDeezerRef } from "@/lib/deezer"
import { X } from "lucide-react"

type Props = {
  open: boolean
  initial?: Album | null
  /** Liste pre-selectionnee a la creation : celle de l'onglet courant. */
  defaultList: AlbumList
  onClose: () => void
  onSubmit: (data: AlbumInput) => void
}

const EMPTY = {
  title: "",
  artist: "",
  year: "",
  cover: "",
  note: "",
  favoriteTrack: "",
  deezerUrl: "",
  spotifyUrl: "",
  appleMusicUrl: "",
  genres: "",
}

export function AlbumForm({ open, initial, defaultList, onClose, onSubmit }: Props) {
  const [form, setForm] = useState(EMPTY)
  const [list, setList] = useState<AlbumList>(defaultList)

  useEffect(() => {
    if (!open) return
    setList(initial?.list ?? defaultList)
    setForm(
      initial
        ? {
            title: initial.title,
            artist: initial.artist,
            year: initial.year,
            cover: initial.cover,
            note: initial.note ?? "",
            favoriteTrack: initial.favoriteTrack ?? "",
            deezerUrl: initial.deezerUrl ?? "",
            spotifyUrl: initial.spotifyUrl ?? "",
            appleMusicUrl: initial.appleMusicUrl ?? "",
            genres: formatGenres(initial.genres),
          }
        : EMPTY,
    )
  }, [open, initial, defaultList])

  // Appelé avant le retour anticipé : l'ordre des hooks doit rester stable.
  const dialogRef = useModal(open, onClose)

  if (!open) return null

  const deezerTouched = form.deezerUrl.trim().length > 0
  const deezerUnrecognized = deezerTouched && !parseDeezerRef(form.deezerUrl)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim() || !form.artist.trim()) return
    onSubmit({
      list,
      title: form.title.trim(),
      artist: form.artist.trim(),
      year: form.year.trim(),
      cover: form.cover.trim(),
      note: form.note.trim() || undefined,
      favoriteTrack: form.favoriteTrack.trim() || undefined,
      deezerUrl: form.deezerUrl.trim() || undefined,
      spotifyUrl: form.spotifyUrl.trim() || undefined,
      appleMusicUrl: form.appleMusicUrl.trim() || undefined,
      genres: parseGenres(form.genres),
    })
    onClose()
  }

  const field =
    "w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none ring-ring placeholder:text-muted-foreground focus-visible:ring-2"

  return (
    // Le defilement porte sur le fond, pas sur le panneau : sur mobile une
    // hauteur en `vh` ignore la barre d'adresse et rognerait le formulaire.
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="safe-inset fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-background/80 backdrop-blur-sm outline-none"
      role="dialog"
      aria-modal="true"
      aria-label={initial ? "Modifier l'album" : "Ajouter un album"}
      onClick={onClose}
    >
      <div className="flex min-h-full items-start justify-center sm:items-center">
        <div
          className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl sm:p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-foreground text-balance">
              {initial ? "Modifier l'album" : "Ajouter un album"}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="relative shrink-0 rounded-md p-1 text-muted-foreground outline-none ring-ring transition-colors after:absolute after:left-1/2 after:top-1/2 after:h-11 after:w-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] hover:text-foreground focus-visible:ring-2"
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

            {/* Les paires de champs s'empilent en dessous de sm */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5 sm:col-span-1">
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
              <div className="flex flex-col gap-1.5 sm:col-span-2">
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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label htmlFor="favoriteTrack" className="text-xs font-medium text-muted-foreground">
                  Titre préféré
                </label>
                <input
                  id="favoriteTrack"
                  className={field}
                  value={form.favoriteTrack}
                  onChange={(e) => setForm((f) => ({ ...f, favoriteTrack: e.target.value }))}
                  placeholder="Ex. Digital Love"
                />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-1">
                <label htmlFor="list" className="text-xs font-medium text-muted-foreground">
                  Liste
                </label>
                {/* `pr-8` degage la fleche native, qui sinon chevauche le libelle */}
                <select
                  id="list"
                  className={`${field} pr-8`}
                  value={list}
                  onChange={(e) => setList(e.target.value as AlbumList)}
                >
                  <option value="top">{LIST_TAB_LABELS.top}</option>
                  <option value="wannabe">{LIST_TAB_LABELS.wannabe}</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="deezerUrl" className="text-xs font-medium text-muted-foreground">
                Lien Deezer
              </label>
              <input
                id="deezerUrl"
                className={field}
                value={form.deezerUrl}
                onChange={(e) => setForm((f) => ({ ...f, deezerUrl: e.target.value }))}
                placeholder="https://www.deezer.com/album/302127"
                aria-describedby="deezerUrl-hint"
              />
              <p
                id="deezerUrl-hint"
                className={`text-xs ${deezerUnrecognized ? "text-destructive" : "text-muted-foreground"}`}
              >
                {deezerUnrecognized
                  ? "Adresse non reconnue : collez l'adresse complète de l'album depuis Deezer (les liens courts deezer.page.link ne fonctionnent pas)."
                  : "Collez l'adresse de l'album depuis Deezer pour afficher le lecteur."}
              </p>
            </div>

            {/* Spotify et Apple Music : simples redirections, pas de lecteur. */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="spotifyUrl" className="text-xs font-medium text-muted-foreground">
                  Lien Spotify
                </label>
                <input
                  id="spotifyUrl"
                  className={field}
                  value={form.spotifyUrl}
                  onChange={(e) => setForm((f) => ({ ...f, spotifyUrl: e.target.value }))}
                  placeholder="https://open.spotify.com/album/…"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="appleMusicUrl" className="text-xs font-medium text-muted-foreground">
                  Lien Apple Music
                </label>
                <input
                  id="appleMusicUrl"
                  className={field}
                  value={form.appleMusicUrl}
                  onChange={(e) => setForm((f) => ({ ...f, appleMusicUrl: e.target.value }))}
                  placeholder="https://music.apple.com/…"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="genres" className="text-xs font-medium text-muted-foreground">
                Genres
              </label>
              <input
                id="genres"
                className={field}
                value={form.genres}
                onChange={(e) => setForm((f) => ({ ...f, genres: e.target.value }))}
                placeholder="Rock, Alternative"
                aria-describedby="genres-hint"
              />
              <p id="genres-hint" className="text-xs text-muted-foreground">
                Séparés par des virgules. Pré-remplis depuis Deezer, souvent approximatifs — corrigez-les librement.
              </p>
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
    </div>
  )
}
