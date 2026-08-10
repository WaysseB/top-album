"use client"

import { useMemo, useState } from "react"
import { fold, type Album } from "@/lib/albums"
import { Disc3, X } from "lucide-react"

type Props = {
  vinyls: Album[]
  value: string | undefined
  onChange: (id: string | undefined) => void
  /** Ce que le rapprochement automatique propose deja, s'il trouve. */
  automatic: Album | null
}

/** Au-dela, la liste devient illisible : c'est a la recherche de trancher. */
const MAX_RESULTS = 40

/**
 * Choix d'un vinyle a lier a un album.
 *
 * Le rapprochement se fait normalement tout seul, sur le titre normalise. Ce
 * selecteur ne sert qu'aux cas que la regle ne peut pas deviner — un pressage
 * dont le titre s'ecarte trop, une compilation, une reedition sous un autre nom.
 * Il l'annonce donc : tant qu'on n'a rien choisi, il affiche ce que le calcul
 * propose deja, pour eviter une saisie inutile.
 *
 * Pas de menu deroulant natif : avec 162 disques, une liste `select` s'ouvre sur
 * un mur de titres sans moyen de filtrer.
 */
export function VinylPicker({ vinyls, value, onChange, automatic }: Props) {
  const [query, setQuery] = useState("")

  const selected = useMemo(() => vinyls.find((v) => v.id === value) ?? null, [vinyls, value])

  const results = useMemo(() => {
    const needle = fold(query)
    if (!needle) return vinyls.slice(0, MAX_RESULTS)
    return vinyls
      .filter((v) => fold(v.title).includes(needle) || fold(v.artist).includes(needle))
      .slice(0, MAX_RESULTS)
  }, [vinyls, query])

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-primary/60 bg-primary/10 px-3 py-2">
        <span className="flex min-w-0 items-center gap-2 text-sm">
          <Disc3 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 truncate">
            <span className="text-muted-foreground">{selected.artist}</span>
            {selected.artist ? " — " : ""}
            {selected.title}
          </span>
        </span>
        <button
          type="button"
          onClick={() => {
            onChange(undefined)
            setQuery("")
          }}
          className="shrink-0 rounded-md p-1 text-muted-foreground outline-none ring-ring transition-colors hover:text-foreground focus-visible:ring-2"
          aria-label="Retirer la liaison"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Rechercher un vinyle par titre ou artiste…"
        className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none ring-ring placeholder:text-muted-foreground focus-visible:ring-2"
      />

      {query.trim() ? (
        <ul className="max-h-48 overflow-y-auto overscroll-contain rounded-md border border-border bg-background/50 p-1">
          {results.length === 0 && (
            <li className="px-2 py-2 text-xs text-muted-foreground">Aucun vinyle ne correspond.</li>
          )}
          {results.map((vinyl) => (
            <li key={vinyl.id}>
              <button
                type="button"
                onClick={() => onChange(vinyl.id)}
                className="flex w-full items-baseline gap-2 rounded px-2 py-1.5 text-left text-xs outline-none ring-ring transition-colors hover:bg-secondary focus-visible:ring-2"
              >
                <span className="min-w-0 truncate">
                  <span className="text-muted-foreground">{vinyl.artist}</span>
                  {vinyl.artist ? " — " : ""}
                  {vinyl.title}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : automatic ? (
        <p className="text-xs text-muted-foreground">
          Rapproché automatiquement de{" "}
          <span className="text-foreground">
            {automatic.artist ? `${automatic.artist} — ` : ""}
            {automatic.title}
          </span>
          . Une liaison manuelle remplacerait ce choix.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Aucun vinyle rapproché automatiquement. Cherchez-en un ci-dessus si vous le possédez.
        </p>
      )}
    </div>
  )
}
