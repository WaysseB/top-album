"use client"

import type { Album } from "@/lib/albums"
import { GripVertical } from "lucide-react"
import { useState } from "react"

type Props = {
  album: Album
  rank: number
  editMode: boolean
  isDragging: boolean
  isDragOver: boolean
  onOpen: () => void
  onDragStart: () => void
  onDragEnter: () => void
  onDragEnd: () => void
}

function coverGradient(seed: string): string {
  // Deterministic hue from the album title so each cover fallback is distinct
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash) % 360
  return `linear-gradient(145deg, oklch(0.32 0.09 ${hue}), oklch(0.18 0.05 ${(hue + 60) % 360}))`
}

export function AlbumCard({
  album,
  rank,
  editMode,
  isDragging,
  isDragOver,
  onOpen,
  onDragStart,
  onDragEnter,
  onDragEnd,
}: Props) {
  const initials = album.title
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")

  return (
    <button
      type="button"
      draggable={editMode}
      onClick={onOpen}
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      className={`group relative aspect-square w-full overflow-hidden rounded-md bg-card text-left outline-none ring-ring transition-all duration-200 focus-visible:ring-2 ${
        editMode ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
      } ${isDragging ? "scale-95 opacity-40" : ""} ${
        isDragOver ? "ring-2 ring-primary" : ""
      }`}
      aria-label={`${album.title} par ${album.artist}, classé numéro ${rank}`}
    >
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
          <span className="font-mono text-2xl font-semibold text-foreground/80">{initials}</span>
        </div>
      )}

      {/* Rank badge */}
      <span className="absolute left-2 top-2 flex h-7 min-w-7 items-center justify-center rounded-full bg-background/70 px-1.5 font-mono text-xs font-semibold text-foreground backdrop-blur-sm">
        {rank}
      </span>

      {/* Drag handle indicator in edit mode */}
      {editMode && (
        <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-background/70 text-foreground backdrop-blur-sm">
          <GripVertical className="h-4 w-4" aria-hidden="true" />
        </span>
      )}

      {/* Hover / focus detail overlay */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-background via-background/60 to-transparent p-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
        <p className="truncate text-sm font-semibold leading-tight text-foreground">{album.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {album.artist}
          {album.year ? ` · ${album.year}` : ""}
        </p>
      </div>
    </button>
  )
}
