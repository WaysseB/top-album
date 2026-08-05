"use client"

import { useEffect, useRef, useState } from "react"
import { useAlbums } from "@/hooks/use-albums"
import { LIST_LABELS, LIST_TAB_LABELS, type Album, type AlbumInput, type AlbumList, type ListCounts } from "@/lib/albums"
import { AlbumCard } from "@/components/album-card"
import { AlbumForm } from "@/components/album-form"
import { AlbumDetail } from "@/components/album-detail"
import { ListTabs } from "@/components/list-tabs"
import { Button } from "@/components/ui/button"
import { buildAlbumsExport, exportFilename } from "@/lib/export-albums"
import { ListOrdered, Plus, Check, Download } from "lucide-react"

type Props = {
  list: AlbumList
  initialAlbums: Album[]
  counts: ListCounts
}

const SUBTITLES: Record<AlbumList, string> = {
  top: "survolez une pochette pour un aperçu, cliquez pour les détails.",
  wannabe: "les albums à découvrir, en attente d'une place dans le top.",
}

const EMPTY_STATES: Record<AlbumList, string> = {
  top: "Aucun album pour le moment.",
  wannabe: "Aucun album en attente.",
}

export function AlbumsView({ list, initialAlbums, counts }: Props) {
  const { albums, pending, error, clearError, addAlbum, updateAlbum, removeAlbum, reorder, persistOrder } =
    useAlbums(initialAlbums)

  const [editMode, setEditMode] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Album | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const dragIndex = useRef<number | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  // Une erreur remontee par le serveur remplace le message de succes.
  useEffect(() => {
    if (error) setNotice(null)
  }, [error])

  const detailIndex = albums.findIndex((a) => a.id === detailId)
  const detailAlbum = detailIndex >= 0 ? albums[detailIndex] : null

  const openAdd = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const openEdit = (album: Album) => {
    setDetailId(null)
    setEditing(album)
    setFormOpen(true)
  }

  const handleSubmit = async (data: AlbumInput) => {
    const target = editing
    const ok = target ? await updateAlbum(target.id, data) : await addAlbum(data)
    if (!ok) return

    if (data.list !== list) {
      setNotice(`« ${data.title} » déplacé vers ${LIST_TAB_LABELS[data.list]}.`)
    } else {
      setNotice(target ? "Album modifié." : `« ${data.title} » ajouté.`)
    }
  }

  const handleExport = () => {
    try {
      const json = JSON.stringify(buildAlbumsExport(albums, LIST_LABELS[list]), null, 2)
      const blob = new Blob([json], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = exportFilename(list)
      link.click()
      URL.revokeObjectURL(url)
      setNotice(`Liste exportée (${albums.length} album${albums.length > 1 ? "s" : ""}).`)
    } catch {
      window.alert("Export impossible.")
    }
  }

  const handleDragEnter = (index: number) => {
    if (dragIndex.current === null || dragIndex.current === index) return
    reorder(dragIndex.current, index)
    dragIndex.current = index
    setDragging(index)
    setDragOver(index)
  }

  // L'ordre n'est envoye en base qu'une fois, au relachement de la pochette.
  const handleDragEnd = () => {
    const moved = dragIndex.current !== null
    dragIndex.current = null
    setDragging(null)
    setDragOver(null)
    if (moved) void persistOrder()
  }

  return (
    <main className="min-h-screen px-4 py-10 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">Ma sélection</p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground text-balance sm:text-4xl">
              {LIST_LABELS[list]}
            </h1>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              {albums.length} album{albums.length > 1 ? "s" : ""} · {SUBTITLES[list]}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleExport} disabled={albums.length === 0}>
              <Download className="h-4 w-4" />
              Exporter
            </Button>
            <Button
              variant={editMode ? "default" : "outline"}
              onClick={() => setEditMode((v) => !v)}
              aria-pressed={editMode}
              disabled={albums.length < 2}
            >
              {editMode ? <Check className="h-4 w-4" /> : <ListOrdered className="h-4 w-4" />}
              {editMode ? "Terminer" : "Réorganiser"}
            </Button>
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4" />
              Ajouter
            </Button>
          </div>
        </header>

        <div className="mb-6">
          <ListTabs counts={counts} />
        </div>

        {error && (
          <div
            role="alert"
            className="mb-5 flex items-center justify-between gap-4 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            <span>{error}</span>
            <button
              onClick={clearError}
              className="shrink-0 font-mono text-xs uppercase tracking-widest opacity-70 hover:opacity-100"
            >
              Fermer
            </button>
          </div>
        )}

        {notice && !error && (
          <div
            role="status"
            className="mb-5 flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground"
          >
            <span>{notice}</span>
            <button
              onClick={() => setNotice(null)}
              className="shrink-0 font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
            >
              Fermer
            </button>
          </div>
        )}

        {editMode && (
          <div className="mb-5 rounded-lg border border-dashed border-border bg-card/50 px-4 py-3 text-sm text-muted-foreground">
            Mode réorganisation : glissez-déposez les pochettes pour changer leur classement.
          </div>
        )}

        {albums.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border py-24 text-center">
            <p className="text-sm text-muted-foreground">{EMPTY_STATES[list]}</p>
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4" />
              Ajouter un album
            </Button>
          </div>
        ) : (
          <div
            className={`grid grid-cols-2 gap-x-3 gap-y-6 transition-opacity sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 ${
              pending ? "opacity-70" : ""
            }`}
          >
            {albums.map((album, index) => (
              <AlbumCard
                key={album.id}
                album={album}
                rank={index + 1}
                editMode={editMode}
                isDragging={dragging === index}
                isDragOver={dragOver === index && dragging !== index}
                onOpen={() => (editMode ? undefined : setDetailId(album.id))}
                onDragStart={() => {
                  dragIndex.current = index
                  setDragging(index)
                }}
                onDragEnter={() => handleDragEnter(index)}
                onDragEnd={handleDragEnd}
              />
            ))}
          </div>
        )}
      </div>

      <AlbumForm
        open={formOpen}
        initial={editing}
        defaultList={list}
        onClose={() => setFormOpen(false)}
        onSubmit={(data) => void handleSubmit(data)}
      />

      <AlbumDetail
        album={detailAlbum}
        rank={detailIndex + 1}
        onClose={() => setDetailId(null)}
        onEdit={() => detailAlbum && openEdit(detailAlbum)}
        onDelete={() => {
          if (detailAlbum) {
            void removeAlbum(detailAlbum.id)
            setDetailId(null)
          }
        }}
      />
    </main>
  )
}
