"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  ALBUM_LISTS,
  CURATED_LISTS,
  decadeLabel,
  indexByMatchKey,
  LIST_LABELS,
  LIST_PATHS,
  LIST_TAB_LABELS,
  NO_DECADE,
  resolveVinyl,
  type Album,
  type AlbumList,
} from "@/lib/albums"
import { computeStats, type Completeness, type Tally } from "@/lib/stats"
import { useCollection } from "@/components/collection-context"
import { ListTabs } from "@/components/list-tabs"
import { ChevronRight } from "lucide-react"

type Scope = AlbumList | "all"

const SCOPES: { key: Scope; label: string }[] = [
  // Le libelle dit ce que le perimetre fait vraiment : « Toutes » aurait laisse
  // croire que les vinyles y sont comptes.
  { key: "all", label: "Toutes sauf vinyles" },
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

/**
 * Une ligne de completude, depliable sur la liste des fiches a corriger.
 *
 * Chaque album pointe vers sa liste avec la recherche pre-remplie sur son titre :
 * on arrive directement dessus, prêt à ouvrir la fiche et à la compléter.
 */
type RowAlbum = { id: string; artist: string; title: string; badge: string; href: string }

/**
 * Ligne chiffree, depliable sur les albums concernes.
 *
 * Partagee par les deux blocs de la page : la completude des fiches et le
 * croisement de la collection avec les listes. Meme presentation, meme barre,
 * meme mecanique de repli — seule change la nature de ce qui est compte.
 */
function DisclosureRow({
  label,
  note,
  count,
  total,
  albums,
}: {
  label: string
  /** Ce que la liste depliee contient, ex. « a completer ». */
  note: string
  /** Numerateur de la barre. */
  count: number
  total: number
  albums: RowAlbum[]
}) {
  const share = total > 0 ? Math.round((count / total) * 100) : 0

  /**
   * La liste n'est montee qu'une fois ouverte.
   *
   * Rendue systematiquement, elle repetait en HTML des albums deja presents
   * dans la charge utile de la page — 176 Ko pour des lignes que personne ne
   * regarde tant qu'il n'a pas clique.
   */
  const [open, setOpen] = useState(false)

  const bar = (
    <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
      <div
        className={`h-full rounded-full ${share === 100 ? "bg-primary" : "bg-primary/50"}`}
        style={{ width: `${share}%` }}
      />
    </div>
  )

  const chiffres = (
    <span className="font-mono text-xs text-muted-foreground tabular-nums">
      {count}/{total} · {share} %
    </span>
  )

  // Liste vide : pas de fleche ni de zone cliquable qui ne menerait nulle part.
  if (albums.length === 0) {
    return (
      <li className="flex flex-col gap-1 py-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-foreground">{label}</span>
          {chiffres}
        </div>
        {bar}
      </li>
    )
  }

  return (
    <li>
      <details className="group" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary className="flex cursor-pointer list-none flex-col gap-1 rounded-md py-1.5 outline-none ring-ring focus-visible:ring-2 [&::-webkit-details-marker]:hidden">
          <div className="flex items-baseline justify-between gap-3">
            <span className="flex items-center gap-1.5 text-sm text-foreground">
              <ChevronRight
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
                aria-hidden="true"
              />
              {label}
              <span className="text-xs text-muted-foreground">
                — {albums.length} {note}
              </span>
            </span>
            {chiffres}
          </div>
          {bar}
        </summary>

        {/* Plafonnee : « Deezer » sur les vinyles, c'est 162 lignes. */}
        <ul
          hidden={!open}
          className="mb-2 ml-5 max-h-64 space-y-px overflow-y-auto overscroll-contain rounded-md border border-border bg-background/50 p-1.5"
        >
          {open &&
            albums.map((album) => (
              <li key={album.id}>
                <Link
                  href={album.href}
                  className="flex items-baseline justify-between gap-3 rounded px-2 py-1.5 text-xs outline-none ring-ring transition-colors hover:bg-secondary focus-visible:ring-2"
                >
                  <span className="min-w-0 truncate text-foreground">
                    <span className="text-muted-foreground">{album.artist}</span>
                    {album.artist ? " — " : ""}
                    {album.title}
                  </span>
                  <span className="shrink-0 font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                    {album.badge}
                  </span>
                </Link>
              </li>
            ))}
        </ul>
      </details>
    </li>
  )
}

/** Adapte une fiche a completer en element de ligne depliable. */
function toMissingItem(album: Album): RowAlbum {
  return {
    id: album.id,
    artist: album.artist,
    title: album.title,
    badge: LIST_TAB_LABELS[album.list],
    // La recherche pre-remplie sur le titre amene directement dessus.
    href: `${LIST_PATHS[album.list]}?q=${encodeURIComponent(album.title)}`,
  }
}

export function StatsView() {
  const { albumsByList, counts, isAdmin } = useCollection()
  const [scope, setScope] = useState<Scope>("all")

  /**
   * « Toutes » agrege les listes de gout, pas la collection vinyle.
   *
   * Celle-ci recoupe largement les autres — 32 albums du Top y figurent aussi —
   * et l'y inclure comptait deux fois les memes disques : l'artiste le plus
   * cite, les genres dominants et la decennie dominante en sortaient fausses.
   * Le perimetre « Vinyles » reste disponible pour la regarder pour elle-meme.
   */
  const albums = useMemo(
    () => (scope === "all" ? CURATED_LISTS.flatMap((list) => albumsByList[list]) : albumsByList[scope]),
    [albumsByList, scope],
  )

  const stats = useMemo(() => computeStats(albums), [albums])

  /**
   * Croisement de la collection avec les listes de gout.
   *
   * Ce que la page ne disait pas jusqu'ici : parmi les disques possedes,
   * lesquels figurent aussi dans le classement, et lesquels n'appartiennent
   * qu'a l'inventaire. C'est la lecture propre au perimetre « Vinyles ».
   */
  const croisement = useMemo(() => {
    const vinyles = albumsByList.vinyl
    const restants = new Set(vinyles.map((album) => album.id))

    // Le parcours va de l'album vers le vinyle, dans le sens ou la liaison
    // manuelle est enregistree — sinon celle-ci serait ignoree ici.
    const index = indexByMatchKey(vinyles)
    const byId = new Map(vinyles.map((album) => [album.id, album]))

    const parListe = CURATED_LISTS.map((liste) => {
      const trouves: RowAlbum[] = []

      for (const album of albumsByList[liste]) {
        const vinyle = resolveVinyl(album, byId, index)
        if (!vinyle) continue
        restants.delete(vinyle.id)
        trouves.push({
          id: album.id,
          artist: album.artist,
          title: album.title,
          badge: LIST_TAB_LABELS[liste],
          // On pointe vers l'album dans SA liste : c'est la qu'il porte son
          // rang, et que la pastille de possession a un sens.
          href: `${LIST_PATHS[liste]}?album=${album.id}`,
        })
      }

      return { liste, trouves }
    })

    const orphelins = vinyles
      .filter((album) => restants.has(album.id))
      .map((album) => ({
        id: album.id,
        artist: album.artist,
        title: album.title,
        badge: "Vinyle",
        href: `${LIST_PATHS.vinyl}?album=${album.id}`,
      }))

    return { parListe, orphelins, total: vinyles.length }
  }, [albumsByList])

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

            {/* Propre au perimetre « Vinyles » : ailleurs, le croisement
                repondrait a une question que personne ne se pose. */}
            {scope === "vinyl" && croisement.total > 0 && (
              <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
                <h2 className="mb-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                  Ma collection face à mes listes
                </h2>
                <p className="mb-4 text-xs text-muted-foreground">
                  Sur {croisement.total} disques possédés, ceux qui figurent aussi dans un
                  classement.
                </p>
                <ul className="flex flex-col gap-1">
                  {croisement.parListe.map(({ liste, trouves }) => (
                    <DisclosureRow
                      key={liste}
                      label={LIST_LABELS[liste]}
                      note="en vinyle"
                      count={trouves.length}
                      total={croisement.total}
                      albums={trouves}
                    />
                  ))}
                  <DisclosureRow
                    label="Dans aucune autre liste"
                    note="uniquement en vinyle"
                    count={croisement.orphelins.length}
                    total={croisement.total}
                    albums={croisement.orphelins}
                  />
                </ul>
              </section>
            )}

            {/* Reserve a l'administrateur : c'est une file de travail, pas une
                statistique. Un visiteur n'a que faire de ce qu'il reste a saisir,
                et l'afficher exposerait les lacunes de la collection. */}
            {isAdmin && (
              <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
                <h2 className="mb-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                  Fiches complétées
                </h2>
                <p className="mb-4 text-xs text-muted-foreground">
                  Ce qu&apos;il reste à renseigner sur ce périmètre.
                </p>
                <ul className="flex flex-col gap-1">
                  {stats.completeness.map((item) => (
                    <DisclosureRow
                      key={item.label}
                      label={item.label}
                      note="à compléter"
                      count={item.filled}
                      total={stats.total}
                      albums={item.missing.map(toMissingItem)}
                    />
                  ))}
                </ul>
              </section>
            )}
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
