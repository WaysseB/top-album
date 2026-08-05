"use client"

export type FacetItem = {
  /** Valeur remontee a `onSelect`. */
  key: string
  label: string
  count: number
}

type Props = {
  ariaLabel: string
  items: FacetItem[]
  /** Effectif affiche sur « Tous » : le total avant filtrage par CETTE facette. */
  total: number
  selected: string | null
  onSelect: (key: string | null) => void
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
export function FacetFilter({ ariaLabel, items, total, selected, onSelect }: Props) {
  if (items.length < 2) return null

  const chip = (active: boolean) =>
    `inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium outline-none ring-ring transition-colors focus-visible:ring-2 ${
      active
        ? "border-primary bg-primary/15 text-foreground"
        : "border-border bg-secondary text-muted-foreground hover:text-foreground"
    }`

  const badge = (active: boolean) =>
    `font-mono text-[0.65rem] ${active ? "text-foreground/70" : "text-muted-foreground/70"}`

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={[
        // Mobile : une seule ligne qui defile, debordant jusqu'aux bords de l'ecran.
        "-mx-4 flex items-center gap-1.5 overflow-x-auto overscroll-x-contain px-4 py-1",
        // Barre de defilement masquee : le debordement des pastilles suffit a l'indiquer.
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        // A partir de sm, retour a un enroulement classique.
        "sm:mx-0 sm:flex-wrap sm:overflow-x-visible sm:px-0 sm:py-0",
      ].join(" ")}
    >
      <button type="button" onClick={() => onSelect(null)} className={chip(selected === null)}>
        Tous
        <span className={badge(selected === null)}>{total}</span>
      </button>
      {items.map(({ key, label, count }) => (
        <button
          key={key}
          type="button"
          onClick={() => onSelect(selected === key ? null : key)}
          aria-pressed={selected === key}
          aria-label={`${label}, ${count} album${count > 1 ? "s" : ""}`}
          className={chip(selected === key)}
        >
          {label}
          <span className={badge(selected === key)}>{count}</span>
        </button>
      ))}
    </div>
  )
}
