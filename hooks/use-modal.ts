"use client"

import { useEffect, useRef } from "react"

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",")

/**
 * Comportements attendus d'une boite de dialogue, absents jusqu'ici alors que
 * les modales annoncent `role="dialog"` et `aria-modal="true"` :
 *
 *  - Echap referme ;
 *  - le focus entre dans la modale a l'ouverture, y reste au Tab, et revient
 *    a son point de depart a la fermeture ;
 *  - la page derriere cesse de defiler — sur mobile, c'est ce qui donne
 *    l'impression que la modale « glisse » sur le contenu.
 *
 * Renvoie la reference a poser sur le conteneur de la modale.
 */
export function useModal(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null)

  // Les appelants passent souvent une lambda recreee a chaque rendu. La garder
  // dans une reference evite que l'effet se rejoue — ce qui redonnerait le
  // focus et rebloquerait le defilement en boucle.
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return

    const container = ref.current
    const previouslyFocused = document.activeElement as HTMLElement | null

    const focusables = () =>
      Array.from(container?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        (element) => element.offsetParent !== null || element === document.activeElement,
      )

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        closeRef.current()
        return
      }
      if (event.key !== "Tab") return

      const items = focusables()
      if (items.length === 0) {
        event.preventDefault()
        container?.focus()
        return
      }

      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement

      // Le piege se referme aux deux extremites, y compris quand le focus a
      // deja quitte la modale.
      if (event.shiftKey && (active === first || !container?.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || !container?.contains(active))) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", handleKey)

    // Blocage du defilement de fond, avec compensation de la barre de
    // defilement pour eviter un saut horizontal sur ordinateur.
    const body = document.body
    const previousOverflow = body.style.overflow
    const previousPadding = body.style.paddingRight
    const gap = window.innerWidth - document.documentElement.clientWidth
    body.style.overflow = "hidden"
    if (gap > 0) body.style.paddingRight = `${gap}px`

    // Le premier element focusable, sinon le conteneur lui-meme.
    const target = focusables()[0] ?? container
    target?.focus({ preventScroll: true })

    return () => {
      document.removeEventListener("keydown", handleKey)
      body.style.overflow = previousOverflow
      body.style.paddingRight = previousPadding
      previouslyFocused?.focus?.({ preventScroll: true })
    }
  }, [open])

  return ref
}
