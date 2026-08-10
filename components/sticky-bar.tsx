"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

/**
 * Barre collante qui ne se signale qu'une fois collee.
 *
 * Au repos elle est transparente et sans bordure : elle fait partie de la page,
 * dans la continuite de l'en-tete. Une bordure permanente sur toute la largeur
 * y tracait une separation entre le titre et la grille, alors qu'il n'y a rien
 * a separer tant que rien ne passe dessous.
 *
 * L'etat « collee » se detecte avec une sentinelle placee juste au-dessus : des
 * qu'elle quitte le haut de la fenetre, la barre a pris sa position fixe. C'est
 * plus sur qu'un calcul de position au defilement, et l'observateur ne se
 * declenche qu'au franchissement du seuil au lieu de travailler a chaque pixel.
 */
export function StickyBar({ className = "", children }: { className?: string; children: ReactNode }) {
  const sentinel = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  const [stuck, setStuck] = useState(false)

  useEffect(() => {
    const cible = sentinel.current
    const barre = bar.current
    if (!cible || !barre) return

    // `top` vaut `env(safe-area-inset-top)` : la valeur resolue en pixels n'est
    // connue qu'ici. La marge negative decale le seuil d'autant, sinon la barre
    // serait declaree collee trop tot sur un ecran a encoche.
    const offset = Number.parseFloat(getComputedStyle(barre).top) || 0

    const observer = new IntersectionObserver(
      ([entree]) => setStuck(!entree.isIntersecting),
      { rootMargin: `-${offset}px 0px 0px 0px`, threshold: 0 },
    )

    observer.observe(cible)
    return () => observer.disconnect()
  }, [])

  return (
    <>
      {/* Sans hauteur : la sentinelle ne doit rien ajouter a la mise en page. */}
      <div ref={sentinel} aria-hidden="true" className="h-0" />

      <div
        ref={bar}
        className={`sticky top-[env(safe-area-inset-top)] z-30 transition-colors duration-200 ${
          stuck ? "border-b border-border bg-background/95 backdrop-blur" : "border-b border-transparent"
        } ${className}`}
      >
        {children}
      </div>
    </>
  )
}
