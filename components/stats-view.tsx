"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  ALBUM_LISTS,
  decadeLabel,
  LIST_TAB_LABELS,
  NO_DECADE,
  type Album,
  type AlbumList,
  type ListCounts,
} from "@/lib/albums"
import { computeStats, type Tally } from "@/lib/stats"
import { ListTabs } from "@/components/list-tabs"

type Scope = AlbumList | "all"

type Props = {
  albumsByList: Record<AlbumList, Album[]>
  counts: ListCounts
}

const SCOPES: { key: Scope; label: string }[] = [
  { key: "all", label: "Toutes" },
  ...ALBUM_LISTS.map((list) => ({ key: list as Scope, label: LIST_TAB_LABELS[list] })),
]

/** Un compteur mis en avant, en tete de page. */
function Highlight({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4">
      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold leading-tight text-foreground text-balance">{value}</p>
      {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
    </div>
  )
}

/**
 * Classement en barres. La longueur est relative au premier de la liste, et non
 * au total : sur 230 albums, un artiste a 4 occurrences donnerait une barre
 * invisible.
 */
function BarList({
  title,
  items,
  empty,
  unit,
}: {
  title: string
  items: Tally[]
  empty: string
  unit: string
}) {
  const max = items[0]?.count ?? 0

  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <h2 className="mb-4 font-mono text-xs uppercase tracking-widest text-muted-foreground">{title}</h2>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ol className="flex flex-col gap-2.5">
          {items.map((item, index) => (
            <li key={item.key} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="w-5 shrink-0 font-mono text-xs text-muted-foreground/70 tabular-nums">
                    {index + 1}
                  </span>
                  <span className="truncate text-sm text-foreground">{item.label}</span>
                </span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                  {item.count} {unit}
                  {item.count > 1 ? "s" : ""}
                </span>
              </div>
              <div className="ml-7 h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary/70"
                  style={{ width: `${max ? (item.count / max) * 100 : 0}%` }}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

export function StatsView({ albumsByList, counts }: Props) {
  const [scope, setScope] = useState<Scope>("all")

  const albums = useMemo(
    () => (scope === "all" ? ALBUM_LISTS.flatMap((list) => albumsByList[list]) : albumsByList[scope]),
    [albumsByList, scope],
  )

  const stats = useMemo(() => computeStats(albums), [albums])

  const topArtist = stats.artists[0] ?? null
  const repeated = stats.artists.filter((a) => a.count > 1).length

  // L'annee la plus presente se lit sur le classement par frequence, pas sur la
  // frise chronologique — d'ou ce tri local.
  const topYear = useMemo(
    () => [...stats.years].sort((a, b) => b.count - a.count)[0] ?? null,
    [stats.years],
  )

  const topDecade = useMemo(
    () => [...stats.decades].filter((d) => d.key !== NO_DECADE).sort((a, b) => b.count - a.count)[0] ?? null,
    [stats.decades],
  )

  const decadeMax = Math.max(1, ...stats.decades.map((d) => d.count))

  return (
    <main className="min-h-screen px-4 py-10 sm:px-8 lg:px-12">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header>
          <p className="mb-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">Ma sélection</p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Statistiques</h1>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            Ce que disent {stats.total} album{stats.total > 1 ? "s" : ""} de mes goûts.
          </p>
        </header>

        <ListTabs counts={counts} />

        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Périmètre</span>
          {SCOPES.map(({ key, label }) => {
            const active = scope === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setScope(key)}
                aria-pressed={active}
                className={`rounded-full border px-3.5 py-2 text-xs font-medium outline-none ring-ring transition-colors focus-visible:ring-2 sm:px-3 sm:py-1 ${
                  active
                    ? "border-primary bg-primary/15 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>

        {stats.total === 0 ? (
          <p className="rounded-xl border border-dashed border-border py-24 text-center text-sm text-muted-foreground">
            Aucun album dans ce périmètre.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Highlight
                label="Artiste le plus cité"
                value={topArtist?.label ?? "—"}
                detail={topArtist ? `${topArtist.count} album${topArtist.count > 1 ? "s" : ""}` : undefined}
              />
              <Highlight
                label="Année la plus présente"
                value={topYear?.label ?? "—"}
                detail={topYear ? `${topYear.count} album${topYear.count > 1 ? "s" : ""}` : undefined}
              />
              <Highlight
                label="Décennie dominante"
                value={topDecade ? decadeLabel(Number(topDecade.key)) : "—"}
                detail={
                  topDecade
                    ? `${Math.round((topDecade.count / stats.total) * 100)} % de la sélection`
                    : undefined
                }
              />
              <Highlight
                label="Artistes distincts"
                value={String(stats.distinctArtists)}
                detail={`${repeated} reviennent plusieurs fois`}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <BarList
                title="Artistes les plus présents"
                items={stats.artists.filter((a) => a.count > 1).slice(0, 12)}
                empty="Aucun artiste n'apparaît deux fois."
                unit="album"
              />
              <BarList
                title="Genres dominants"
                items={stats.genres.slice(0, 12)}
                empty="Aucun genre renseigné."
                unit="album"
              />
            </div>

            <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <h2 className="mb-5 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Répartition par décennie
              </h2>
              {/* Histogramme : la lecture chronologique justifie des barres
                  verticales, contrairement aux classements ci-dessus. */}
              <ol className="flex items-end gap-1.5 overflow-x-auto pb-1 sm:gap-3">
                {stats.decades.map((decade) => (
                  <li key={decade.key} className="flex min-w-10 flex-1 flex-col items-center gap-1.5">
                    <span className="font-mono text-xs text-muted-foreground tabular-nums">{decade.count}</span>
                    <div
                      className="w-full rounded-t bg-primary/70"
                      style={{ height: `${Math.max(4, (decade.count / decadeMax) * 140)}px` }}
                    />
                    <span className="whitespace-nowrap font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                      {decade.key === NO_DECADE ? "n.c." : decadeLabel(Number(decade.key))}
                    </span>
                  </li>
                ))}
              </ol>
            </section>

            <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <h2 className="mb-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Fiches complétées
              </h2>
              <p className="mb-4 text-xs text-muted-foreground">
                Ce qu&apos;il reste à renseigner sur ce périmètre.
              </p>
              <ul className="flex flex-col gap-2.5">
                {stats.completeness.map(({ label, filled }) => {
                  const share = Math.round((filled / stats.total) * 100)
                  return (
                    <li key={label} className="flex flex-col gap-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm text-foreground">{label}</span>
                        <span className="font-mono text-xs text-muted-foreground tabular-nums">
                          {filled}/{stats.total} · {share} %
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                        <div
                          className={`h-full rounded-full ${share === 100 ? "bg-primary" : "bg-primary/50"}`}
                          style={{ width: `${share}%` }}
                        />
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          </>
        )}

        <Link
          href="/"
          className="font-mono text-xs uppercase tracking-widest text-muted-foreground underline underline-offset-4 outline-none ring-ring hover:text-foreground focus-visible:ring-2"
        >
          Retour au classement
        </Link>
      </div>
    </main>
  )
}
