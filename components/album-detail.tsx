"use client"

import type React from "react"

import { useEffect, useRef } from "react"
import type { Album } from "@/lib/albums"
import { useModal } from "@/hooks/use-modal"
import { Button, buttonVariants } from "@/components/ui/button"
import { deezerPageUrl, deezerWidgetHeight, deezerWidgetUrl, parseDeezerRef } from "@/lib/deezer"
import { ChevronLeft, ChevronRight, Disc3, ExternalLink, Pencil, Trash2, X } from "lucide-react"

type Props = {
  album: Album | null
  rank: number
  /** Faux sur les listes non classees. */
  showRank?: boolean
  /** Rang dans la liste parcourue, pour se reperer : « 12 / 162 ». */
  position?: number
  total?: number
  /** Absent en bout de liste : la commande correspondante disparait. */
  onPrevious?: () => void
  onNext?: () => void
  /**
   * Le vinyle correspondant, quand l'album figure aussi dans la collection.
   * Nul si l'album est deja consulte depuis la liste des vinyles : la pastille
   * n'y apprendrait rien.
   */
  ownedVinyl?: Album | null
  /** Les actions d'edition ne sont rendues que pour l'administrateur connecte. */
  isAdmin: boolean
  onClose: () => void
  /** Rebondit sur la discographie : la recherche est deja globale aux trois listes. */
  onSelectArtist?: (artist: string) => void
  onEdit: () => void
  onDelete: () => void
}

/**
 * Hauteur de 44 px sur telephone — la cible tactile recommandee — ramenee a 32
 * sur ecran large, ou le pointeur est precis. En bout de liste le bouton reste
 * en place, desactive : le faire disparaitre decalerait le compteur.
 */
const navClass =
  "flex h-11 items-center gap-1 rounded-md px-2.5 text-xs font-medium text-muted-foreground outline-none ring-ring transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-30 sm:h-8"

function coverGradient(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash) % 360
  return `linear-gradient(145deg, oklch(0.32 0.09 ${hue}), oklch(0.18 0.05 ${(hue + 60) % 360}))`
}

export function AlbumDetail({
  album,
  rank,
  showRank = true,
  position = 0,
  total = 0,
  onPrevious,
  onNext,
  ownedVinyl = null,
  isAdmin,
  onClose,
  onSelectArtist,
  onEdit,
  onDelete,
}: Props) {
  // Appelé avant tout retour anticipé : l'ordre des hooks doit rester stable.
  const dialogRef = useModal(album !== null, onClose)

  // Les handlers vivent dans une référence : sans elle, l'abonnement clavier
  // serait refait à chaque rendu du parent.
  const navigation = useRef({ onPrevious, onNext })
  useEffect(() => {
    navigation.current = { onPrevious, onNext }
  })

  useEffect(() => {
    if (!album) return

    const onKeyDown = (event: KeyboardEvent) => {
      // Une flèche saisie dans un champ appartient au champ, pas à la fiche.
      const target = event.target as HTMLElement | null
      if (target?.closest("input, textarea, select")) return

      if (event.key === "ArrowLeft") navigation.current.onPrevious?.()
      if (event.key === "ArrowRight") navigation.current.onNext?.()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [album])

  /**
   * Glissement horizontal, seul équivalent tactile des flèches.
   *
   * Le seuil de 60 px et la comparaison avec le déplacement vertical évitent de
   * changer d'album quand le doigt fait défiler la fiche.
   */
  const touch = useRef<{ x: number; y: number } | null>(null)

  const onTouchStart = (event: React.TouchEvent) => {
    const point = event.touches[0]
    touch.current = { x: point.clientX, y: point.clientY }
  }

  const onTouchEnd = (event: React.TouchEvent) => {
    const start = touch.current
    touch.current = null
    if (!start) return

    const point = event.changedTouches[0]
    const dx = point.clientX - start.x
    const dy = point.clientY - start.y

    if (Math.abs(dx) < 60 || Math.abs(dx) <= Math.abs(dy)) return
    if (dx > 0) onPrevious?.()
    else onNext?.()
  }

  if (!album) return null

  const initials = album.title
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")

  // Le lecteur n'apparait que si l'URL enregistree est une reference Deezer valide.
  const deezer = parseDeezerRef(album.deezerUrl)

  return (
    // Le defilement porte sur le fond, pas sur le panneau : sur mobile une
    // hauteur en `vh` ignore la barre d'adresse et rognerait le contenu.
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="safe-inset fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-background/80 backdrop-blur-sm outline-none"
      role="dialog"
      aria-modal="true"
      aria-label={`Détails de ${album.title}`}
      onClick={onClose}
    >
      <div className="flex min-h-full items-start justify-center sm:items-center">
        <div
          className="w-full max-w-sm overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
          onClick={(e) => e.stopPropagation()}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {/* Plafonnée : pleine largeur, la pochette occupait tout l'écran
              d'un téléphone avant même le lecteur. */}
          <div className="relative aspect-square max-h-[45vh] w-full overflow-hidden">
            {album.cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              // La fiche s'ouvre a la demande : la pochette est prioritaire ici.
              <img
                src={album.cover || "/placeholder.svg"}
                alt={`Pochette de ${album.title}`}
                // Voir AlbumCard : les pochettes Discogs n'ont pas d'en-tete CORS.
                referrerPolicy="no-referrer"
                decoding="async"
                width={300}
                height={300}
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
            {showRank && (
              <span className="absolute left-3 top-3 flex h-8 min-w-8 items-center justify-center rounded-full bg-background/70 px-2 font-mono text-sm font-semibold text-foreground backdrop-blur-sm">
                #{rank}
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              // La pseudo-élément porte la zone tactile à 44 px sans grossir le bouton.
              className="absolute right-3 top-3 rounded-full bg-background/70 p-1.5 text-foreground outline-none ring-ring backdrop-blur-sm transition-colors after:absolute after:left-1/2 after:top-1/2 after:h-11 after:w-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] hover:bg-background focus-visible:ring-2"
              aria-label="Fermer"
            >
              <X className="h-5 w-5" />
            </button>

          </div>

          {/* Barre de navigation sous la pochette, et non par-dessus : une
              pochette est ce qu'on vient regarder, rien ne doit la recouvrir. */}
          {(onPrevious || onNext) && (
            <div className="flex items-center justify-between border-b border-border px-2 py-1.5">
              <button
                type="button"
                onClick={onPrevious}
                disabled={!onPrevious}
                className={navClass}
                aria-label="Album précédent"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Précédent</span>
              </button>

              {total > 1 && position > 0 && (
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {position} / {total}
                </span>
              )}

              <button
                type="button"
                onClick={onNext}
                disabled={!onNext}
                className={navClass}
                aria-label="Album suivant"
              >
                <span className="hidden sm:inline">Suivant</span>
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}

          <div className="flex flex-col gap-3 p-5">
            <div>
              {/* Au-dessus du titre : sa propre ligne, donc aucune interaction
                  avec la longueur de celui-ci. */}
              {ownedVinyl && (
                <span
                  className="mb-2 inline-flex items-center gap-1 rounded-full border border-primary/60 bg-primary/15 px-2 py-0.5 text-xs font-medium text-foreground"
                  // Le support exact est trop long pour la pastille, mais c'est
                  // l'information qu'on cherche en la voyant.
                  title={ownedVinyl.format || "Dans ma collection"}
                >
                  <Disc3 className="h-3 w-3" aria-hidden="true" />
                  Je l&apos;ai en vinyle
                </span>
              )}
              <h2 className="text-xl font-semibold leading-tight text-foreground text-balance">{album.title}</h2>
              <p className="text-sm text-muted-foreground">
                {album.artist &&
                  (onSelectArtist ? (
                    <button
                      type="button"
                      onClick={() => onSelectArtist(album.artist)}
                      className="rounded-sm underline decoration-dotted underline-offset-4 outline-none ring-ring transition-colors hover:text-foreground focus-visible:ring-2"
                      title={`Voir tous les albums de ${album.artist}`}
                    >
                      {album.artist}
                    </button>
                  ) : (
                    album.artist
                  ))}
                {album.year ? ` · ${album.year}` : ""}
              </p>
              {album.favoriteTrack && (
                <p className="mt-1 text-sm italic text-muted-foreground/90">♪ {album.favoriteTrack}</p>
              )}
              {album.format && (
                <p className="mt-1 font-mono text-xs uppercase tracking-wider text-muted-foreground/80">
                  {album.format}
                </p>
              )}
              {album.genres.length > 0 && (
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  {album.genres.map((genre) => (
                    <span
                      key={genre}
                      className="rounded-full border border-border bg-secondary px-2 py-0.5 text-xs text-muted-foreground"
                    >
                      {genre}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {album.note && <p className="text-sm leading-relaxed text-foreground/80 text-pretty">{album.note}</p>}

            {deezer && (
              <div className="flex flex-col gap-1.5">
                <iframe
                  title={`Écouter ${album.title} sur Deezer`}
                  src={deezerWidgetUrl(deezer)}
                  height={deezerWidgetHeight(deezer)}
                  width="100%"
                  // `autoplay` volontairement absent : rien ne demarre a l'ouverture.
                  allow="encrypted-media; clipboard-write"
                  loading="lazy"
                  className="w-full max-w-full rounded-lg border-0"
                />
                <a
                  href={deezerPageUrl(deezer)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 self-start font-mono text-xs uppercase tracking-widest text-muted-foreground outline-none ring-ring transition-colors hover:text-foreground focus-visible:ring-2"
                >
                  Ouvrir sur Deezer
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              </div>
            )}

            {/* Redirections simples : pas de lecteur integre pour ces deux-la. */}
            {(album.spotifyUrl || album.appleMusicUrl) && (
              <div className="flex flex-wrap gap-2">
                {album.spotifyUrl && (
                  <a
                    href={album.spotifyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonVariants({ variant: "outline", className: "flex-1" })}
                  >
                    Spotify
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                )}
                {album.appleMusicUrl && (
                  <a
                    href={album.appleMusicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonVariants({ variant: "outline", className: "flex-1" })}
                  >
                    Apple Music
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                )}
              </div>
            )}

            {isAdmin && (
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
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
