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
 */
export function FacetFilter({ ariaLabel, items, total, selected, onSelect }: Props) {
  if (items.length < 2) return null

  const chip = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium outline-none ring-ring transition-colors focus-visible:ring-2 ${
      active
        ? "border-primary bg-primary/15 text-foreground"
        : "border-border bg-secondary text-muted-foreground hover:text-foreground"
    }`

  const badge = (active: boolean) =>
    `font-mono text-[0.65rem] ${active ? "text-foreground/70" : "text-muted-foreground/70"}`

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={ariaLabel}>
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
