"use client"

import { useEffect, useRef, useState } from "react"
import { useAlbums } from "@/hooks/use-albums"
import type { Album, AlbumInput } from "@/lib/albums"
import { AlbumCard } from "@/components/album-card"
import { AlbumForm } from "@/components/album-form"
import { AlbumDetail } from "@/components/album-detail"
import { Button } from "@/components/ui/button"
import { parseTopsters, toTopstersFile } from "@/lib/topsters"
import { ListOrdered, Plus, Check, Upload, Download } from "lucide-react"

type Props = {
  initialAlbums: Album[]
}

export function AlbumsView({ initialAlbums }: Props) {
  const {
    albums,
    pending,
    error,
    clearError,
    addAlbum,
    updateAlbum,
    removeAlbum,
    importAlbums,
    reorder,
    persistOrder,
  } = useAlbums(initialAlbums)

  const [editMode, setEditMode] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Album | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement | null>(null)

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
    if (ok) {
      setNotice(target ? "Album modifié." : `« ${data.title} » ajouté à votre top.`)
    }
  }

  const handleImportFile = async (file: File) => {
    let parsed: AlbumInput[]
    let skipped = 0
    try {
      const { albums: items, skipped: ignored } = await parseTopsters(await file.text())
      parsed = items
      skipped = ignored
    } catch (err) {
      setNotice(null)
      window.alert(err instanceof Error ? err.message : "Import impossible.")
      return
    }

    const replace =
      albums.length > 0
        ? window.confirm(
            `Importer ${parsed.length} album${parsed.length > 1 ? "s" : ""} depuis Topsters.\n\n` +
              "OK : remplacer votre top actuel\nAnnuler : ajouter à la suite",
          )
        : true

    const ok = await importAlbums(parsed, replace)
    if (ok) {
      setNotice(
        `${parsed.length} album${parsed.length > 1 ? "s" : ""} importé${parsed.length > 1 ? "s" : ""}` +
          (skipped > 0
            ? ` (${skipped} case${skipped > 1 ? "s" : ""} vide${skipped > 1 ? "s" : ""} ignorée${skipped > 1 ? "s" : ""})`
            : "") +
          ".",
      )
    }
  }

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void handleImportFile(file)
    e.target.value = "" // permet de reimporter le meme fichier
  }

  const handleExport = async () => {
    try {
      const content = await toTopstersFile(albums)
      const blob = new Blob([content], { type: "application/octet-stream" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = "mon-top-albums.topster"
      link.click()
      URL.revokeObjectURL(url)
      setNotice("Top exporté au format Topsters (.topster).")
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
        <header className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">Ma sélection</p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground text-balance sm:text-4xl">
              Mon Top Albums
            </h1>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              {albums.length} album{albums.length > 1 ? "s" : ""} · survolez une pochette pour un aperçu, cliquez pour
              les détails.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".topsters,.topster,.json,application/json"
              onChange={onFileChange}
              className="sr-only"
              aria-hidden="true"
              tabIndex={-1}
            />
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4" />
              Importer
            </Button>
            <Button variant="outline" onClick={() => void handleExport()} disabled={albums.length === 0}>
              <Download className="h-4 w-4" />
              Exporter
            </Button>
            <Button
              variant={editMode ? "default" : "outline"}
              onClick={() => setEditMode((v) => !v)}
              aria-pressed={editMode}
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
            <p className="text-sm text-muted-foreground">Aucun album pour le moment.</p>
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4" />
              Ajouter votre premier album
            </Button>
          </div>
        ) : (
          <div
            className={`grid grid-cols-2 gap-3 transition-opacity sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 ${
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
