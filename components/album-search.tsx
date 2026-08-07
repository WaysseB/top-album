"use client"

import { Search, X } from "lucide-react"

type Props = {
  value: string
  onChange: (value: string) => void
  /** Nombre de resultats, affiche seulement quand une recherche est en cours. */
  resultCount: number
}

export function AlbumSearch({ value, onChange, resultCount }: Props) {
  return (
    <div className="relative w-full sm:w-64">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Rechercher un album, un artiste…"
        aria-label="Rechercher un album ou un artiste"
        className="w-full rounded-md border border-border bg-secondary py-2 pl-9 pr-9 text-sm text-foreground outline-none ring-ring placeholder:text-muted-foreground focus-visible:ring-2 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Effacer la recherche"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground outline-none ring-ring transition-colors after:absolute after:left-1/2 after:top-1/2 after:h-11 after:w-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] hover:text-foreground focus-visible:ring-2"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      {value && (
        <span className="sr-only" role="status">
          {resultCount} résultat{resultCount > 1 ? "s" : ""}
        </span>
      )}
    </div>
  )
}
