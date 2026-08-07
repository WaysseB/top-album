"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"

export type FacetItem = {
  /** Valeur remontee a `onSelect`. */
  key: string
  label: string
  count: number
}

type Props = {
  /** Intitule visible de la rangee, et etiquette du groupe pour les lecteurs d'ecran. */
  label: string
  items: FacetItem[]
  /** Effectif affiche sur « Tous » : le total avant filtrage par CETTE facette. */
  total: number
  selected: string | null
  onSelect: (key: string | null) => void
  /** Au-dela de ce nombre, les pastilles suivantes sont repliees. */
  collapseAfter?: number
}

/**
 * Rangee de pastilles filtrantes avec effectifs.
 *
 * Les compteurs sont calcules par l'appelant en tenant compte de la recherche
 * et des AUTRES facettes, mais pas de celle-ci — sinon toutes les pastilles non
 * selectionnees tomberaient a zero des qu'un choix est fait.
 *
 * Sous `sm`, la rangee devient un defilement horizontal plutot que de
 * s'empiler sur quatre lignes : avec une quinzaine de genres, l'enroulement
 * repoussait la grille tres bas sur mobile.
 */
export function FacetFilter({ label, items, total, selected, onSelect, collapseAfter }: Props) {
  const [expanded, setExpanded] = useState(false)

  if (items.length < 2) return null

  const collapsible = collapseAfter !== undefined && items.length > collapseAfter + 1
  let shown = items
  let hidden = 0

  if (collapsible && !expanded) {
    shown = items.slice(0, collapseAfter)
    // La pastille active doit rester visible meme si elle vient de la queue,
    // sinon le filtre en cours disparait de l'ecran.
    const active = items.find((item) => item.key === selected)
    if (active && !shown.includes(active)) shown = [...shown, active]
    hidden = items.length - shown.length
  }

  const chip = (active: boolean) =>
    `inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium outline-none ring-ring transition-colors focus-visible:ring-2 ${
      active
        ? "border-primary bg-primary/15 text-foreground"
        : "border-border bg-secondary text-muted-foreground hover:text-foreground"
    }`

  const badge = (active: boolean) =>
    `font-mono text-[0.65rem] ${active ? "text-foreground/70" : "text-muted-foreground/70"}`

  return (
    <div className="flex flex-col gap-1.5">
      {/* L'intitule reste hors du defilement, pour ne pas s'echapper sur mobile. */}
      <span className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground/70">
        {label}
      </span>

      <div
        role="group"
        aria-label={`Filtrer par ${label.toLowerCase()}`}
        className={[
          "-mx-4 flex items-center gap-1.5 overflow-x-auto overscroll-x-contain px-4 py-1",
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          "sm:mx-0 sm:flex-wrap sm:overflow-x-visible sm:px-0 sm:py-0",
        ].join(" ")}
      >
        <button type="button" onClick={() => onSelect(null)} className={chip(selected === null)}>
          Tous
          <span className={badge(selected === null)}>{total}</span>
        </button>

        {shown.map(({ key, label: name, count }) => (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(selected === key ? null : key)}
            aria-pressed={selected === key}
            aria-label={`${name}, ${count} album${count > 1 ? "s" : ""}`}
            className={chip(selected === key)}
          >
            {name}
            <span className={badge(selected === key)}>{count}</span>
          </button>
        ))}

        {collapsible && (
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            aria-expanded={expanded}
            className={`${chip(false)} border-dashed`}
          >
            {expanded ? "Réduire" : `${hidden} autre${hidden > 1 ? "s" : ""}`}
            <ChevronDown
              className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </button>
        )}
      </div>
    </div>
  )
}
