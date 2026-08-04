"use client"

import type { Album } from "@/lib/albums"
import { Button } from "@/components/ui/button"
import { Pencil, Trash2, X } from "lucide-react"

type Props = {
  album: Album | null
  rank: number
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
}

function coverGradient(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash) % 360
  return `linear-gradient(145deg, oklch(0.32 0.09 ${hue}), oklch(0.18 0.05 ${(hue + 60) % 360}))`
}

export function AlbumDetail({ album, rank, onClose, onEdit, onDelete }: Props) {
  if (!album) return null

  const initials = album.title
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Détails de ${album.title}`}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative aspect-square w-full">
          {album.cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={album.cover || "/placeholder.svg"}
              alt={`Pochette de ${album.title}`}
              crossOrigin="anonymous"
              className="h-full w-full object-cover"
            />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center"
              style={{ background: coverGradient(album.title) }}
            >
              <span className="font-mono text-5xl font-semibold text-foreground/80">{initials}</span>
            </div>
          )}
          <span className="absolute left-3 top-3 flex h-8 min-w-8 items-center justify-center rounded-full bg-background/70 px-2 font-mono text-sm font-semibold text-foreground backdrop-blur-sm">
            #{rank}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 rounded-full bg-background/70 p-1.5 text-foreground outline-none ring-ring backdrop-blur-sm transition-colors hover:bg-background focus-visible:ring-2"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-3 p-5">
          <div>
            <h2 className="text-xl font-semibold leading-tight text-foreground text-balance">{album.title}</h2>
            <p className="text-sm text-muted-foreground">
              {album.artist}
              {album.year ? ` · ${album.year}` : ""}
            </p>
          </div>

          {album.note && <p className="text-sm leading-relaxed text-foreground/80 text-pretty">{album.note}</p>}

          <div className="mt-1 flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={onEdit}>
              <Pencil className="h-4 w-4" />
              Modifier
            </Button>
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={onDelete}
              aria-label="Supprimer l'album"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
