"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useAlbums } from "@/hooks/use-albums"
import {
  decadeLabel,
  decadeOf,
  LIST_LABELS,
  LIST_TAB_LABELS,
  NO_DECADE,
  type Album,
  type AlbumInput,
  type AlbumList,
  type ListCounts,
} from "@/lib/albums"
import { logoutAction } from "@/app/actions"
import { AlbumCard } from "@/components/album-card"
import { AlbumForm } from "@/components/album-form"
import { AlbumDetail } from "@/components/album-detail"
import { AlbumSearch } from "@/components/album-search"
import { FacetFilter, type FacetItem } from "@/components/facet-filter"
import { ListTabs } from "@/components/list-tabs"
import { Button } from "@/components/ui/button"
import { LogOut, Plus } from "lucide-react"

type Props = {
  list: AlbumList
  albumsByList: Record<AlbumList, Album[]>
  counts: ListCounts
  isAdmin: boolean
}

/** Un album avec son rang, et la liste d'ou il vient. */
type Entry = {
  album: Album
  rank: number
  list: AlbumList
}

const SUBTITLES: Record<AlbumList, string> = {
  top: "cliquez sur une pochette pour les détails et l'écoute.",
  wannabe: "les albums à découvrir, en attente d'une place dans le top.",
}

const EMPTY_STATES: Record<AlbumList, string> = {
  top: "Aucun album pour le moment.",
  wannabe: "Aucun album en attente.",
}

/** Repli des accents et de la casse, pour une recherche tolerante. */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
}

function decadeKey(album: Album): string {
  const decade = decadeOf(album.year)
  return decade === null ? NO_DECADE : String(decade)
}

/** Compte les occurrences d'une cle sur un ensemble d'entrees. */
function tally(entries: Entry[], keysOf: (album: Album) => string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const { album } of entries) {
    for (const key of keysOf(album)) counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

export function AlbumsView({ list, albumsByList, counts, isAdmin }: Props) {
  const router = useRouter()
  const { albums, pending, error, clearError, addAlbum, updateAlbum, removeAlbum } = useAlbums(
    albumsByList[list],
  )

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Album | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [genre, setGenre] = useState<string | null>(null)
  const [decade, setDecade] = useState<string | null>(null)

  useEffect(() => {
    if (error) setNotice(null)
  }, [error])

  const otherList: AlbumList = list === "top" ? "wannabe" : "top"

  // Le rang est fige sur la liste complete : filtrer ne renumerote pas.
  const currentEntries = useMemo<Entry[]>(
    () => albums.map((album, index) => ({ album, rank: index + 1, list })),
    [albums, list],
  )
  const otherEntries = useMemo<Entry[]>(
    () => albumsByList[otherList].map((album, index) => ({ album, rank: index + 1, list: otherList })),
    [albumsByList, otherList],
  )

  const needle = fold(query)
  const searching = needle.length > 0

  // La recherche porte sur les deux listes ; sans recherche, on reste sur l'onglet.
  const scope = useMemo(
    () => (searching ? [...currentEntries, ...otherEntries] : currentEntries),
    [searching, currentEntries, otherEntries],
  )

  const searched = useMemo(
    () =>
      needle
        ? scope.filter(
            ({ album }) => fold(album.title).includes(needle) || fold(album.artist).includes(needle),
          )
        : scope,
    [scope, needle],
  )

  const matchesGenre = (entry: Entry) => !genre || entry.album.genres.includes(genre)
  const matchesDecade = (entry: Entry) => !decade || decadeKey(entry.album) === decade

  // Chaque facette compte SANS s'appliquer a elle-meme, sinon les autres
  // pastilles tomberaient a zero des qu'un choix est fait.
  const forGenres = useMemo(() => searched.filter(matchesDecade), [searched, decade])
  const forDecades = useMemo(() => searched.filter(matchesGenre), [searched, genre])

  const genreItems = useMemo<FacetItem[]>(
    () =>
      [...tally(forGenres, (a) => a.genres).entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr"))
        .map(([key, count]) => ({ key, label: key, count })),
    [forGenres],
  )

  const decadeItems = useMemo<FacetItem[]>(() => {
    const counted = tally(forDecades, (a) => [decadeKey(a)])
    const dated = [...counted.entries()]
      .filter(([key]) => key !== NO_DECADE)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([key, count]) => ({ key, label: decadeLabel(Number(key)), count }))

    // « Sans année » ferme la marche : c'est aussi le raccourci vers les fiches à compléter.
    const undated = counted.get(NO_DECADE)
    return undated ? [...dated, { key: NO_DECADE, label: "Sans année", count: undated }] : dated
  }, [forDecades])

  // Une valeur devenue absente ne doit pas figer la grille sur du vide.
  useEffect(() => {
    if (genre && !genreItems.some((item) => item.key === genre)) setGenre(null)
  }, [genre, genreItems])
  useEffect(() => {
    if (decade && !decadeItems.some((item) => item.key === decade)) setDecade(null)
  }, [decade, decadeItems])

  const visible = useMemo(
    () => searched.filter(matchesGenre).filter(matchesDecade),
    [searched, genre, decade],
  )

  // En recherche, on separe les resultats par liste — l'onglet courant d'abord.
  const sections = useMemo(
    () =>
      [list, otherList]
        .map((section) => ({ list: section, entries: visible.filter((e) => e.list === section) }))
        .filter(({ entries }) => entries.length > 0),
    [visible, list, otherList],
  )

  const allEntries = useMemo(
    () => [...currentEntries, ...otherEntries],
    [currentEntries, otherEntries],
  )
  const detailEntry = allEntries.find(({ album }) => album.id === detailId) ?? null

  const filtered = searching || genre !== null || decade !== null

  const resetFilters = () => {
    setQuery("")
    setGenre(null)
    setDecade(null)
  }

  const openAdd = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const openEdit = (album: Album) => {
    setDetailId(null)
    setEditing(album)
    setFormOpen(true)
  }

  const handleSubmit = async (data: AlbumInput) => {
    const target = editing
    const ok = target ? await updateAlbum(target.id, data) : await addAlbum(data)
    if (!ok) return

    if (data.list !== list) {
      setNotice(`« ${data.title} » déplacé vers ${LIST_TAB_LABELS[data.list]}.`)
    } else {
      setNotice(target ? "Album modifié." : `« ${data.title} » ajouté.`)
    }
  }

  const handleLogout = async () => {
    await logoutAction()
    router.refresh()
  }

  const grid = (entries: Entry[]) => (
    <div
      className={`grid grid-cols-2 gap-x-3 gap-y-6 transition-opacity sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 ${
        pending ? "opacity-70" : ""
      }`}
    >
      {entries.map(({ album, rank }) => (
        <AlbumCard key={album.id} album={album} rank={rank} onOpen={() => setDetailId(album.id)} />
      ))}
    </div>
  )

  return (
    <main className="min-h-screen px-4 py-10 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">Ma sélection</p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground text-balance sm:text-4xl">
              {LIST_LABELS[list]}
            </h1>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              {albums.length} album{albums.length > 1 ? "s" : ""} · {SUBTITLES[list]}
            </p>
          </div>

          {/* Rien n'est propose aux visiteurs : l'acces a /login se fait par l'URL. */}
          {isAdmin && (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => void handleLogout()}>
                <LogOut className="h-4 w-4" />
                Déconnexion
              </Button>
              <Button onClick={openAdd}>
                <Plus className="h-4 w-4" />
                Ajouter
              </Button>
            </div>
          )}
        </header>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <ListTabs counts={counts} />
          <AlbumSearch value={query} onChange={setQuery} resultCount={visible.length} />
        </div>

        {(genreItems.length > 1 || decadeItems.length > 1) && (
          <div className="mb-6 flex flex-col gap-2">
            <FacetFilter
              ariaLabel="Filtrer par genre"
              items={genreItems}
              total={forGenres.length}
              selected={genre}
              onSelect={setGenre}
            />
            <FacetFilter
              ariaLabel="Filtrer par décennie"
              items={decadeItems}
              total={forDecades.length}
              selected={decade}
              onSelect={setDecade}
            />
          </div>
        )}

        {searching && (
          <p className="mb-5 text-sm text-muted-foreground">
            Recherche sur les deux listes — {visible.length} résultat{visible.length > 1 ? "s" : ""}.
          </p>
        )}

        {error && (
          <div
            role="alert"
            className="mb-5 flex items-center justify-between gap-4 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            <span>{error}</span>
            <button
              onClick={clearError}
              className="shrink-0 font-mono text-xs uppercase tracking-widest opacity-70 hover:opacity-100"
            >
              Fermer
            </button>
          </div>
        )}

        {notice && !error && (
          <div
            role="status"
            className="mb-5 flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground"
          >
            <span>{notice}</span>
            <button
              onClick={() => setNotice(null)}
              className="shrink-0 font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
            >
              Fermer
            </button>
          </div>
        )}

        {albums.length === 0 && !searching ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border py-24 text-center">
            <p className="text-sm text-muted-foreground">{EMPTY_STATES[list]}</p>
            {isAdmin && (
              <Button onClick={openAdd}>
                <Plus className="h-4 w-4" />
                Ajouter un album
              </Button>
            )}
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-24 text-center">
            <p className="text-sm text-muted-foreground">Aucun album ne correspond à ces critères.</p>
            <button
              onClick={resetFilters}
              className="font-mono text-xs uppercase tracking-widest text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Réinitialiser les filtres
            </button>
          </div>
        ) : searching ? (
          <div className="flex flex-col gap-8">
            {sections.map(({ list: section, entries }) => (
              <section key={section}>
                <h2 className="mb-3 flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                  {LIST_TAB_LABELS[section]}
                  <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[0.65rem] text-muted-foreground">
                    {entries.length}
                  </span>
                </h2>
                {grid(entries)}
              </section>
            ))}
          </div>
        ) : (
          grid(visible)
        )}

        {filtered && visible.length > 0 && (
          <button
            onClick={resetFilters}
            className="mt-8 font-mono text-xs uppercase tracking-widest text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Réinitialiser les filtres
          </button>
        )}
      </div>

      {isAdmin && (
        <AlbumForm
          open={formOpen}
          initial={editing}
          defaultList={list}
          onClose={() => setFormOpen(false)}
          onSubmit={(data) => void handleSubmit(data)}
        />
      )}

      <AlbumDetail
        album={detailEntry?.album ?? null}
        rank={detailEntry?.rank ?? 0}
        isAdmin={isAdmin}
        onClose={() => setDetailId(null)}
        onEdit={() => detailEntry && openEdit(detailEntry.album)}
        onDelete={() => {
          if (detailEntry) {
            void removeAlbum(detailEntry.album.id)
            setDetailId(null)
          }
        }}
      />
    </main>
  )
}
