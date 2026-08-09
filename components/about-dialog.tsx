"use client"

import { useModal } from "@/hooks/use-modal"
import { INTRO_PARAGRAPHS, INTRO_TITLE } from "@/lib/intro"
import { X } from "lucide-react"

type Props = {
  open: boolean
  onClose: () => void
}

/**
 * Le manifesto, en modale.
 *
 * Meme mecanique que la fiche album — `useModal` fournit Echap, le piege de
 * focus, sa restitution au declencheur et le verrou de defilement — mais un
 * habillage different : sans pochette a montrer, le panneau s'elargit et la
 * composition est faite pour du texte suivi.
 */
export function AboutDialog({ open, onClose }: Props) {
  // Appele avant tout retour anticipe : l'ordre des hooks doit rester stable.
  const dialogRef = useModal(open, onClose)

  if (!open) return null

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="safe-inset fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-background/80 backdrop-blur-sm outline-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-title"
      onClick={onClose}
    >
      <div className="flex min-h-full items-start justify-center sm:items-center">
        <div
          className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
            <div>
              <p className="mb-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Ma sélection
              </p>
              <h2 id="about-title" className="text-xl font-semibold leading-tight text-foreground text-balance">
                {INTRO_TITLE}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              // Le pseudo-element porte la zone tactile a 44 px sans grossir le bouton.
              className="relative shrink-0 rounded-full p-1.5 text-muted-foreground outline-none ring-ring transition-colors after:absolute after:left-1/2 after:top-1/2 after:h-11 after:w-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] hover:bg-secondary hover:text-foreground focus-visible:ring-2"
              aria-label="Fermer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* `max-w-prose` borne la mesure de ligne : au-dela d'une soixantaine
              de caracteres, l'oeil perd la ligne suivante en revenant a gauche. */}
          <div className="flex max-w-prose flex-col gap-4 px-5 py-5 sm:px-6">
            {INTRO_PARAGRAPHS.map((paragraph, index) => (
              <p key={index} className="text-sm leading-relaxed text-foreground/85 text-pretty">
                {paragraph}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
