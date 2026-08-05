"use client"

type Props = {
  genres: string[]
  selected: string | null
  onSelect: (genre: string | null) => void
}

export function GenreFilter({ genres, selected, onSelect }: Props) {
  if (genres.length < 2) return null

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-medium outline-none ring-ring transition-colors focus-visible:ring-2 ${
      active
        ? "border-primary bg-primary/15 text-foreground"
        : "border-border bg-secondary text-muted-foreground hover:text-foreground"
    }`

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrer par genre">
      <button type="button" onClick={() => onSelect(null)} className={chip(selected === null)}>
        Tous
      </button>
      {genres.map((genre) => (
        <button
          key={genre}
          type="button"
          onClick={() => onSelect(selected === genre ? null : genre)}
          aria-pressed={selected === genre}
          className={chip(selected === genre)}
        >
          {genre}
        </button>
      ))}
    </div>
  )
}
