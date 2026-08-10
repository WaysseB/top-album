"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useAlbums } from "@/hooks/use-albums"
import {
  ALBUM_LISTS,
  decadeLabel,
  decadeOf,
  findSameAlbum,
  fold,
  indexByMatchKey,
  LIST_SHOWS_RANK,
  resolveVinyl,
  LIST_LABELS,
  LIST_TAB_LABELS,
  NO_DECADE,
  CURATED_LISTS,
  type Album,
  type AlbumInput,
  type AlbumList,
} from "@/lib/albums"
import { useCollection } from "@/components/collection-context"
import { readUrlState, useUrlState } from "@/hooks/use-url-state"
import { logoutAction } from "@/app/actions"
import { AlbumCard } from "@/components/album-card"
import { AlbumForm } from "@/components/album-form"
import { AlbumDetail } from "@/components/album-detail"
import { AlbumSearch } from "@/components/album-search"
import { FacetFilter, type FacetItem } from "@/components/facet-filter"
import { ListTabs } from "@/components/list-tabs"
import { StickyBar } from "@/components/sticky-bar"
import { Button } from "@/components/ui/button"
import { AboutDialog } from "@/components/about-dialog"
import { Check, Info, ListOrdered, LogOut, Plus, Shuffle } from "lucide-react"

type Props = {
  /** Onglet actif. Le reste vient du layout, via le contexte. */
  list: AlbumList
}

/** Un album avec son rang, et la liste d'ou il vient. */
type Entry = {
  album: Album
  rank: number
  list: AlbumList
}

const SUBTITLES: Record<AlbumList, string> = {
  top: "La bande son de ma vie. Les albums les plus importants. Ceux qui passent le plus souvent dans mes oreilles.",
  // Ces listes ont un ordre, simplement il ne s'affiche pas : promettre
  // « sans ordre de préférence » serait devenu faux.
  wannabe: "Il y a ceux qui sont dans mon top 100, et ceux qui y sont presque. Mais genre, presque.",
  ost: "Mes musiques de jeux vidéo préférées. Parce que le bande son est parfois aussi importante que le gameplay.",
  vinyl: "Ma collection de vinyles, histoire de flex un peu (synchro depuis Discogs).",
}

const EMPTY_STATES: Record<AlbumList, string> = {
  top: "Aucun album pour le moment.",
  wannabe: "Aucun album en attente.",
  ost: "Aucune bande originale pour le moment.",
  vinyl: "Aucun vinyle : lancez la synchronisation Discogs.",
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

export function AlbumsView({ list }: Props) {
  const { albumsByList, counts, isAdmin } = useCollection()
  const router = useRouter()
  const { albums, pending, error, clearError, addAlbum, updateAlbum, removeAlbum, reorder, persistOrder } =
    useAlbums(albumsByList[list])

  // L'etat visible est repris de l'URL a l'arrivee : lien partage, favori,
  // rafraichissement, ou renvoi depuis la page de statistiques.
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const initial = useMemo(() => readUrlState(searchParams.toString()), [])

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Album | null>(null)
  const [detailId, setDetailId] = useState<string | null>(initial.album)
  const [notice, setNotice] = useState<string | null>(null)
  const [query, setQuery] = useState(initial.query)
  const [genre, setGenre] = useState<string | null>(initial.genre)
  const [decade, setDecade] = useState<string | null>(initial.decade)
  const [aboutOpen, setAboutOpen] = useState(initial.about)
  const [editMode, setEditMode] = useState(false)
  /** Id de l'album selectionne au toucher, en attente de sa destination. */
  const [picked, setPicked] = useState<string | null>(null)

  const dragIndex = useRef<number | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  useEffect(() => {
    if (error) setNotice(null)
  }, [error])

  // L'URL reflete la recherche, les filtres et la fiche ouverte ; le retour
  // arriere du navigateur referme celle-ci.
  useUrlState(pathname, { query, genre, decade, album: detailId, about: aboutOpen }, (restored) => {
    setQuery(restored.query)
    setGenre(restored.genre)
    setDecade(restored.decade)
    setDetailId(restored.album)
    setAboutOpen(restored.about)
  })

  const otherLists = useMemo(() => ALBUM_LISTS.filter((l) => l !== list), [list])

  // Le rang est fige sur la liste complete : filtrer ne renumerote pas.
  const currentEntries = useMemo<Entry[]>(
    () => albums.map((album, index) => ({ album, rank: index + 1, list })),
    [albums, list],
  )
  const otherEntries = useMemo<Entry[]>(
    () =>
      otherLists.flatMap((other) =>
        albumsByList[other].map((album, index) => ({ album, rank: index + 1, list: other })),
      ),
    [albumsByList, otherLists],
  )

  const needle = fold(query)
  const searching = needle.length > 0

  // La recherche porte sur toutes les listes ; sans recherche, on reste sur l'onglet.
  const scope = useMemo(
    () => (searching ? [...currentEntries, ...otherEntries] : currentEntries),
    [searching, currentEntries, otherEntries],
  )

  const matchesQuery = ({ album }: Entry) =>
    !needle || fold(album.title).includes(needle) || fold(album.artist).includes(needle)

  const searched = useMemo(() => scope.filter(matchesQuery), [scope, needle])

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
      [list, ...otherLists]
        .map((section) => ({ list: section, entries: visible.filter((e) => e.list === section) }))
        .filter(({ entries }) => entries.length > 0),
    [visible, list, otherLists],
  )

  const allEntries = useMemo(
    () => [...currentEntries, ...otherEntries],
    [currentEntries, otherEntries],
  )
  const detailEntry = allEntries.find(({ album }) => album.id === detailId) ?? null

  const vinylIndex = useMemo(() => indexByMatchKey(albumsByList.vinyl), [albumsByList.vinyl])
  const vinylsById = useMemo(
    () => new Map(albumsByList.vinyl.map((album) => [album.id, album])),
    [albumsByList.vinyl],
  )

  // Inutile de signaler la possession sur la liste des vinyles elle-meme :
  // `resolveVinyl` s'en charge.
  const ownedVinyl = detailEntry
    ? resolveVinyl(detailEntry.album, vinylsById, vinylIndex)
    : null

  // Ce que le calcul propose pour l'album en cours d'edition, montre dans le
  // formulaire pour eviter une liaison manuelle inutile.
  const automaticVinyl = editing ? findSameAlbum(editing, vinylIndex) : null

  /**
   * Le tirage ignore l'onglet — c'est un « surprends-moi », pas un echantillon
   * de la page — mais pas les listes : voir `CURATED_LISTS`. Les filtres actifs
   * restent respectes, eux : ils expriment une intention.
   */
  const randomPool = useMemo(
    () =>
      allEntries
        .filter(({ list: from }) => CURATED_LISTS.includes(from))
        .filter(matchesQuery)
        .filter(matchesGenre)
        .filter(matchesDecade),
    [allEntries, needle, genre, decade],
  )

  /**
   * Voisinage de la fiche ouverte, pour passer a l'album suivant sans repasser
   * par la grille.
   *
   * On parcourt ce que l'ecran montre. Si l'album n'y figure pas — cas du
   * tirage au hasard, qui peut ramener un album d'une autre liste — on retombe
   * sur le vivier du tirage, pour que les fleches restent utilisables.
   */
  const neighbours = useMemo(() => {
    if (visible.some(({ album }) => album.id === detailId)) return visible
    return randomPool.some(({ album }) => album.id === detailId) ? randomPool : []
  }, [visible, randomPool, detailId])

  const detailIndex = neighbours.findIndex(({ album }) => album.id === detailId)

  const goToNeighbour = (step: number) => {
    if (detailIndex < 0) return
    const next = neighbours[detailIndex + step]
    if (next) setDetailId(next.album.id)
  }

  const filtered = searching || genre !== null || decade !== null

  const showGenres = genreItems.length > 1
  const showDecades = decadeItems.length > 1

  const resetFilters = () => {
    setQuery("")
    setGenre(null)
    setDecade(null)
  }

  const pickRandom = () => {
    if (randomPool.length === 0) return
    const entry = randomPool[Math.floor(Math.random() * randomPool.length)]
    setDetailId(entry.album.id)
  }

  /**
   * `reorder_albums` renumerote de 1 a N les identifiants recus : reorganiser
   * une liste filtree ecraserait la position des albums masques. Le mode
   * reorganisation efface donc les filtres et affiche la liste entiere.
   */
  const toggleEditMode = () => {
    setPicked(null)
    setEditMode((on) => {
      if (!on) resetFilters()
      return !on
    })
  }

  const handleDragEnter = (index: number) => {
    if (dragIndex.current === null || dragIndex.current === index) return
    reorder(dragIndex.current, index)
    dragIndex.current = index
    setDragging(index)
    setDragOver(index)
  }

  // L'ordre n'est envoye en base qu'une fois, au relachement de la pochette.
  const handleDragEnd = () => {
    const moved = dragIndex.current !== null
    dragIndex.current = null
    setDragging(null)
    setDragOver(null)
    if (moved) void persistOrder()
  }

  /**
   * Selection en deux temps, seule mecanique disponible au toucher : le
   * glisser-deposer HTML5 n'emet pas `dragstart` depuis un doigt.
   */
  const handleActivate = (album: Album, index: number) => {
    if (!editMode) {
      setDetailId(album.id)
      return
    }
    if (picked === null || picked === album.id) {
      setPicked(picked === album.id ? null : album.id)
      return
    }

    const from = albums.findIndex((a) => a.id === picked)
    setPicked(null)
    if (from < 0 || from === index) return

    const next = [...albums]
    const [moved] = next.splice(from, 1)
    next.splice(index, 0, moved)

    reorder(from, index)
    // L'ordre est calcule ici : `persistOrder` sans argument lirait l'etat
    // d'avant le deplacement, qui ne sera commite qu'au rendu suivant.
    void persistOrder(next.map((a) => a.id))
  }

  const pickedAlbum = picked ? albums.find((a) => a.id === picked) ?? null : null

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
      {entries.map(({ album, rank, list: from }, index) => (
        <AlbumCard
          key={album.id}
          album={album}
          rank={rank}
          // Un wannabe croise dans les resultats ne doit pas porter de numero.
          showRank={LIST_SHOWS_RANK[from]}
          editMode={editMode}
          isPicked={picked === album.id}
          isDragging={dragging === index}
          isDragOver={dragOver === index && dragging !== index}
          onOpen={() => handleActivate(album, index)}
          onDragStart={() => {
            dragIndex.current = index
            setDragging(index)
          }}
          onDragEnter={() => handleDragEnter(index)}
          onDragEnd={handleDragEnd}
        />
      ))}
    </div>
  )

  return (
    // Le rembourrage lateral descend au niveau de chaque bloc, et non sur le
    // `<main>` : la barre collante doit pouvoir occuper toute la largeur de
    // l'ecran, ce qu'un conteneur centre lui interdirait.
    <main className="min-h-screen pb-10">
      <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-8 lg:px-12">
        <header className="mb-6 flex flex-col gap-4">
          {/*
            Le titre occupe sa propre ligne, sur toute la largeur, et le lien se
            cale au bord droit. Loge dans la colonne de titre, il se calerait sur
            la largeur du sous-titre et flotterait au milieu de l'en-tete.

            `items-baseline` aligne le lien sur la PREMIERE ligne du titre :
            celui-ci s'enroule sur telephone sans emmener le lien avec lui.
          */}
          <div className="flex items-baseline justify-between gap-4">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground text-balance sm:text-4xl">
              {LIST_LABELS[list]}
            </h1>
            <button
              type="button"
              onClick={() => setAboutOpen(true)}
              className="inline-flex shrink-0 items-center gap-1 rounded-md text-sm text-muted-foreground underline decoration-dotted underline-offset-4 outline-none ring-ring transition-colors hover:text-foreground focus-visible:ring-2"
            >
              <Info className="h-3.5 w-3.5" aria-hidden="true" />À propos
            </button>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              {albums.length} album{albums.length > 1 ? "s" : ""} · {SUBTITLES[list]}
            </p>

            {/* Les boutons passent a h-10 sur mobile : 32 px se ratent au pouce. */}
            <div className="flex flex-wrap items-center gap-2">
            {!editMode && (
              <Button
                variant="outline"
                className="h-10 sm:h-8"
                onClick={pickRandom}
                disabled={randomPool.length === 0}
                title={`Un album au hasard parmi ${randomPool.length} — ${CURATED_LISTS.map(
                  (l) => LIST_TAB_LABELS[l],
                ).join(", ")}`}
              >
                <Shuffle className="h-4 w-4" />
                Découvrir un album au hasard
              </Button>
            )}

            {isAdmin && (
              <>
                <Button variant="outline" className="h-10 sm:h-8" onClick={() => void handleLogout()}>
                  <LogOut className="h-4 w-4" />
                  Déconnexion
                </Button>
                {/* Toutes les listes se reorganisent, y compris celles dont le
                    numero de rang reste masque. */}
                <Button
                  variant={editMode ? "default" : "outline"}
                  className="h-10 sm:h-8"
                  onClick={toggleEditMode}
                  aria-pressed={editMode}
                  disabled={albums.length < 2}
                >
                  {editMode ? <Check className="h-4 w-4" /> : <ListOrdered className="h-4 w-4" />}
                  {editMode ? "Terminer" : "Réorganiser"}
                </Button>
                <Button className="h-10 sm:h-8" onClick={openAdd} disabled={editMode}>
                  <Plus className="h-4 w-4" />
                  Ajouter
                </Button>
              </>
            )}
            </div>
          </div>
        </header>
      </div>

      {/*
        Barre de navigation et de filtres, maintenue en haut au defilement.

        Elle s'etend sur toute la largeur de la fenetre et centre son propre
        contenu, plutot que de vivre dans le conteneur centre : sinon les
        pochettes defileraient dans les gouttieres restees transparentes de part
        et d'autre — d'autant plus larges que l'ecran l'est.

        Fond et bordure n'apparaissent qu'une fois la barre collee, voir
        `StickyBar` : au repos elle prolonge l'en-tete au lieu de l'en separer.

        Le `<header>` (titre, boutons) reste dans le flux : il n'a rien a faire
        ici une fois qu'on parcourt la grille.
      */}
      <StickyBar className="mb-6">
        {/* Rembourrage bas plus genereux que le haut : la derniere rangee de
            pastilles touchait la bordure de la barre. */}
        <div className="mx-auto flex max-w-6xl flex-col gap-1.5 px-4 pb-3 pt-1.5 sm:px-8 sm:pb-3.5 sm:pt-2 lg:px-12">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <ListTabs counts={counts} />
            {!editMode && <AlbumSearch value={query} onChange={setQuery} resultCount={visible.length} />}
          </div>

          {!editMode && (showGenres || showDecades) && (
            <div className="flex flex-col gap-1.5">
              <FacetFilter
                label="Genres"
                items={genreItems}
                total={forGenres.length}
                selected={genre}
                onSelect={setGenre}
                collapseAfter={8}
              />
              {/* Separateur masque sur telephone : chaque pixel de la barre y est
                  pris sur la grille. */}
              {showGenres && showDecades && (
                <div className="hidden h-px bg-border/60 sm:block" aria-hidden="true" />
              )}
              {/* Les decennies sont peu nombreuses et ordonnees : rien a replier. */}
              <FacetFilter
                label="Décennie"
                items={decadeItems}
                total={forDecades.length}
                selected={decade}
                onSelect={setDecade}
              />
            </div>
          )}
        </div>
      </StickyBar>

      <div className="mx-auto max-w-6xl px-4 sm:px-8 lg:px-12">

        {!editMode && searching && (
          <p className="mb-5 text-sm text-muted-foreground">
            Recherche sur toutes les listes — {visible.length} résultat{visible.length > 1 ? "s" : ""}.
          </p>
        )}

        {editMode && (
          <div
            role="status"
            className={`mb-5 rounded-lg border border-dashed px-4 py-3 text-sm ${
              pickedAlbum
                ? "border-primary/60 bg-primary/10 text-foreground"
                : "border-border bg-card/50 text-muted-foreground"
            }`}
          >
            {pickedAlbum ? (
              <>
                <span className="font-semibold">« {pickedAlbum.title} »</span> sélectionné — touchez
                la position de destination, ou touchez-le à nouveau pour annuler.
              </>
            ) : (
              <>
                Mode réorganisation : touchez un album pour le sélectionner, puis touchez sa
                nouvelle position. À la souris, le glisser-déposer fonctionne aussi. La recherche et
                les filtres sont suspendus — l&apos;ordre porte sur la liste entière.
              </>
            )}
          </div>
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

        {editMode ? (
          grid(currentEntries)
        ) : albums.length === 0 && !searching ? (
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

        {!editMode && filtered && visible.length > 0 && (
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
          vinyls={albumsByList.vinyl}
          automaticVinyl={automaticVinyl}
          onClose={() => setFormOpen(false)}
          onSubmit={(data) => void handleSubmit(data)}
        />
      )}

      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />

      <AlbumDetail
        album={detailEntry?.album ?? null}
        rank={detailEntry?.rank ?? 0}
        showRank={detailEntry ? LIST_SHOWS_RANK[detailEntry.list] : false}
        ownedVinyl={ownedVinyl}
        position={detailIndex >= 0 ? detailIndex + 1 : 0}
        total={neighbours.length}
        onPrevious={detailIndex > 0 ? () => goToNeighbour(-1) : undefined}
        onNext={detailIndex >= 0 && detailIndex < neighbours.length - 1 ? () => goToNeighbour(1) : undefined}
        isAdmin={isAdmin}
        onClose={() => setDetailId(null)}
        onSelectArtist={(artist) => {
          setDetailId(null)
          resetFilters()
          setQuery(artist)
        }}
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
