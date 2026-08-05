"use client"

import type { Album } from "@/lib/albums"

type Props = {
  album: Album
  rank: number
  onOpen: () => void
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

export function AlbumCard({ album, rank, onOpen }: Props) {
  const initials = album.title
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")

  const label = [
    `${album.title}${album.artist ? ` par ${album.artist}` : ""}`,
    `classé numéro ${rank}`,
    album.favoriteTrack ? `titre préféré : ${album.favoriteTrack}` : null,
  ]
    .filter(Boolean)
    .join(", ")

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full cursor-pointer flex-col rounded-md text-left outline-none ring-ring transition-all duration-200 focus-visible:ring-2"
      aria-label={label}
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-md bg-card">
        {album.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={album.cover || "/placeholder.svg"}
            alt={`Pochette de ${album.title}`}
            crossOrigin="anonymous"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{ background: coverGradient(album.title) }}
          >
            <span className="font-mono text-2xl font-semibold text-foreground/80">{initials}</span>
          </div>
        )}

        <span className="absolute left-2 top-2 flex h-7 min-w-7 items-center justify-center rounded-full bg-background/70 px-1.5 font-mono text-xs font-semibold text-foreground backdrop-blur-sm">
          {rank}
        </span>
      </div>

      {/* Metadonnees, toujours visibles sous la pochette */}
      <div className="flex flex-col gap-0.5 px-0.5 pt-2">
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">{album.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {album.artist}
          {album.year ? ` · ${album.year}` : ""}
        </p>
        {album.favoriteTrack && (
          <p className="truncate text-xs italic text-muted-foreground/80">♪ {album.favoriteTrack}</p>
        )}
      </div>
    </button>
  )
}
