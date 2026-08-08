"use client"

import type { Album } from "@/lib/albums"
import { GripVertical } from "lucide-react"

type Props = {
  album: Album
  rank: number
  /** Faux sur les listes non classees : le numero laisserait croire a une hierarchie. */
  showRank?: boolean
  /** Activation de la carte : ouvre la fiche, ou sert au deplacement en mode reorganisation. */
  onOpen: () => void
  /** Mode reorganisation : la carte devient deplacable au lieu d'ouvrir la fiche. */
  editMode?: boolean
  /** Album selectionne, en attente de sa position de destination. */
  isPicked?: boolean
  isDragging?: boolean
  isDragOver?: boolean
  onDragStart?: () => void
  onDragEnter?: () => void
  onDragEnd?: () => void
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
  showRank = true,
  onOpen,
  editMode = false,
  isPicked = false,
  isDragging = false,
  isDragOver = false,
  onDragStart,
  onDragEnter,
  onDragEnd,
}: Props) {
  const initials = album.title
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")

  const description = [
    `${album.title}${album.artist ? ` par ${album.artist}` : ""}`,
    showRank ? `classé numéro ${rank}` : null,
    album.favoriteTrack ? `titre préféré : ${album.favoriteTrack}` : null,
  ]
    .filter(Boolean)
    .join(", ")

  const label = editMode
    ? isPicked
      ? `${description}. Sélectionné — activez à nouveau pour annuler.`
      : `${description}. Activez pour déplacer.`
    : description

  return (
    <button
      type="button"
      draggable={editMode}
      onClick={onOpen}
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      className={`group flex w-full flex-col rounded-md text-left outline-none ring-ring transition-all duration-200 focus-visible:ring-2 ${
        editMode ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
      } ${isDragging ? "scale-95 opacity-40" : ""} ${
        isPicked ? "scale-95 opacity-60 ring-2 ring-primary" : ""
      } ${isDragOver ? "ring-2 ring-primary" : ""}`}
      aria-label={label}
      aria-pressed={editMode ? isPicked : undefined}
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-md bg-card">
        {album.cover ? (
          // La grille compte jusqu'a 118 pochettes : sans `lazy`, le navigateur
          // les telecharge toutes avant le premier defilement.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={album.cover || "/placeholder.svg"}
            alt={`Pochette de ${album.title}`}
            // Le CDN Discogs refuse les requetes portant un `Referer` etranger,
            // et ne renvoie pas d'en-tete CORS : `crossOrigin` ferait echouer le
            // chargement pur et simple. Rien ici ne lit les pixels de l'image.
            referrerPolicy="no-referrer"
            loading="lazy"
            decoding="async"
            width={300}
            height={300}
            // `motion-safe` : pas de zoom si le système demande moins d'animations.
            className={`h-full w-full object-cover transition-transform duration-300 ${
              editMode ? "" : "motion-safe:group-hover:scale-105"
            }`}
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{ background: coverGradient(album.title) }}
          >
            <span className="font-mono text-2xl font-semibold text-foreground/80">{initials}</span>
          </div>
        )}

        {showRank && (
          <span className="absolute left-2 top-2 flex h-7 min-w-7 items-center justify-center rounded-full bg-background/70 px-1.5 font-mono text-xs font-semibold text-foreground backdrop-blur-sm">
            {rank}
          </span>
        )}

        {editMode && (
          <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-background/70 text-foreground backdrop-blur-sm">
            <GripVertical className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
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
        {album.format && (
          <p className="truncate text-xs text-muted-foreground/80">{album.format}</p>
        )}
        {album.genres.length > 0 && (
          // Masquée sur mobile : à deux colonnes, cinq lignes de texte sous une
          // vignette de 170 px saturent la grille. Les genres restent dans la fiche.
          // Deux genres au plus : au-dela, la ligne devient du bruit.
          <p className="hidden truncate pt-0.5 font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground/70 sm:block">
            {album.genres.slice(0, 2).join(" · ")}
          </p>
        )}
      </div>
    </button>
  )
}
