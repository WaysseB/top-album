"use client"

export type GenreCount = {
  name: string
  count: number
}

type Props = {
  genres: GenreCount[]
  /** Nombre total d'albums de la liste, affiche sur « Tous ». */
  total: number
  selected: string | null
  onSelect: (genre: string | null) => void
}

export function GenreFilter({ genres, total, selected, onSelect }: Props) {
  if (genres.length < 2) return null

  const chip = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium outline-none ring-ring transition-colors focus-visible:ring-2 ${
      active
        ? "border-primary bg-primary/15 text-foreground"
        : "border-border bg-secondary text-muted-foreground hover:text-foreground"
    }`

  const badge = (active: boolean) =>
    `font-mono text-[0.65rem] ${active ? "text-foreground/70" : "text-muted-foreground/70"}`

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrer par genre">
      <button type="button" onClick={() => onSelect(null)} className={chip(selected === null)}>
        Tous
        <span className={badge(selected === null)}>{total}</span>
      </button>
      {genres.map(({ name, count }) => (
        <button
          key={name}
          type="button"
          onClick={() => onSelect(selected === name ? null : name)}
          aria-pressed={selected === name}
          aria-label={`${name}, ${count} album${count > 1 ? "s" : ""}`}
          className={chip(selected === name)}
        >
          {name}
          <span className={badge(selected === name)}>{count}</span>
        </button>
      ))}
    </div>
  )
}
