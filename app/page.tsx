"use client"

import { useRef, useState } from "react"
import { useAlbums } from "@/hooks/use-albums"
import type { Album } from "@/lib/albums"
import { AlbumCard } from "@/components/album-card"
import { AlbumForm } from "@/components/album-form"
import { AlbumDetail } from "@/components/album-detail"
import { Button } from "@/components/ui/button"
import { parseTopsters, toTopstersFile } from "@/lib/topsters"
import { ListOrdered, Plus, Check, Upload, Download } from "lucide-react"

export default function Page() {
  const { albums, loaded, addAlbum, importAlbums, updateAlbum, removeAlbum, reorder } = useAlbums()

  const [editMode, setEditMode] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Album | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [importMsg, setImportMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null)

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const dragIndex = useRef<number | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

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

  const handleSubmit = (data: Omit<Album, "id">) => {
    if (editing) {
      updateAlbum(editing.id, data)
    } else {
      addAlbum(data)
    }
  }

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text()
      const { albums: parsed, skipped } = await parseTopsters(text)
      const replace =
        albums.length > 0
          ? window.confirm(
              `Importer ${parsed.length} album${parsed.length > 1 ? "s" : ""} depuis Topsters.\n\n` +
                "OK : remplacer votre top actuel\nAnnuler : ajouter à la suite",
            )
          : true
      importAlbums(parsed, replace)
      setImportMsg({
        kind: "ok",
        text:
          `${parsed.length} album${parsed.length > 1 ? "s" : ""} importé${parsed.length > 1 ? "s" : ""}` +
          (skipped > 0 ? ` (${skipped} case${skipped > 1 ? "s" : ""} vide${skipped > 1 ? "s" : ""} ignorée${skipped > 1 ? "s" : ""})` : "") +
          ".",
      })
    } catch (err) {
      setImportMsg({
        kind: "error",
        text: err instanceof Error ? err.message : "Import impossible.",
      })
    }
  }

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void handleImportFile(file)
    e.target.value = "" // allow re-importing the same file
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
      setImportMsg({ kind: "ok", text: "Top exporté au format Topsters (.topster)." })
    } catch {
      setImportMsg({ kind: "error", text: "Export impossible." })
    }
  }

  const handleDragEnter = (index: number) => {
    if (dragIndex.current === null || dragIndex.current === index) return
    reorder(dragIndex.current, index)
    dragIndex.current = index
    setDragging(index)
    setDragOver(index)
  }

  const handleDragEnd = () => {
    dragIndex.current = null
    setDragging(null)
    setDragOver(null)
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

        {importMsg && (
          <div
            role="status"
            className={`mb-5 flex items-center justify-between gap-4 rounded-lg border px-4 py-3 text-sm ${
              importMsg.kind === "ok"
                ? "border-border bg-card text-foreground"
                : "border-destructive/50 bg-destructive/10 text-destructive"
            }`}
          >
            <span>{importMsg.text}</span>
            <button
              onClick={() => setImportMsg(null)}
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

        {!loaded ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="aspect-square w-full animate-pulse rounded-md bg-card" />
            ))}
          </div>
        ) : albums.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border py-24 text-center">
            <p className="text-sm text-muted-foreground">Aucun album pour le moment.</p>
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4" />
              Ajouter votre premier album
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
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

      <AlbumForm open={formOpen} initial={editing} onClose={() => setFormOpen(false)} onSubmit={handleSubmit} />

      <AlbumDetail
        album={detailAlbum}
        rank={detailIndex + 1}
        onClose={() => setDetailId(null)}
        onEdit={() => detailAlbum && openEdit(detailAlbum)}
        onDelete={() => {
          if (detailAlbum) {
            removeAlbum(detailAlbum.id)
            setDetailId(null)
          }
        }}
      />
    </main>
  )
}
