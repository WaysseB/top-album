"use client"

import { useEffect, useState } from "react"
import { ArrowUp } from "lucide-react"

/** En deca, le bouton n'a rien a resoudre : le haut de page est encore proche. */
const THRESHOLD = 600

export function BackToTop() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // `passive` : la fonction ne fait que lire la position, elle n'annule jamais
    // l'evenement. Le dire au navigateur lui evite d'attendre avant de defiler.
    const onScroll = () => setVisible(window.scrollY > THRESHOLD)

    onScroll() // etat correct si la page est rechargee en cours de defilement
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  const toTop = () => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" })
  }

  return (
    <button
      type="button"
      onClick={toTop}
      // Toujours monte, mais retire du parcours clavier et du calque tactile
      // tant qu'il est invisible : une opacite nulle seule laisserait un bouton
      // fantome cliquable au-dessus de la grille.
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      aria-label="Remonter en haut"
      title="Remonter en haut"
      className={`fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-40 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-lg outline-none ring-ring transition-all duration-200 hover:bg-secondary focus-visible:ring-2 ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
      }`}
    >
      <ArrowUp className="h-5 w-5" aria-hidden="true" />
    </button>
  )
}
