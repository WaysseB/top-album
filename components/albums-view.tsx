"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useAlbums } from "@/hooks/use-albums"
import { LIST_LABELS, LIST_TAB_LABELS, type Album, type AlbumInput, type AlbumList, type ListCounts } from "@/lib/albums"
import { logoutAction } from "@/app/actions"
import { AlbumCard } from "@/components/album-card"
import { AlbumForm } from "@/components/album-form"
import { AlbumDetail } from "@/components/album-detail"
import { AlbumSearch } from "@/components/album-search"
import { ListTabs } from "@/components/list-tabs"
import { Button, buttonVariants } from "@/components/ui/button"
import { LogIn, LogOut, Plus } from "lucide-react"

type Props = {
  list: AlbumList
  initialAlbums: Album[]
  counts: ListCounts
  isAdmin: boolean
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

export function AlbumsView({ list, initialAlbums, counts, isAdmin }: Props) {
  const router = useRouter()
  const { albums, pending, error, clearError, addAlbum, updateAlbum, removeAlbum } = useAlbums(initialAlbums)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Album | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [query, setQuery] = useState("")

  // Une erreur remontee par le serveur remplace le message de succes.
  useEffect(() => {
    if (error) setNotice(null)
  }, [error])

  // Le rang est fige sur la liste complete : filtrer ne doit pas renumeroter.
  const ranked = useMemo(() => albums.map((album, index) => ({ album, rank: index + 1 })), [albums])

  const visible = useMemo(() => {
    const needle = fold(query)
    if (!needle) return ranked
    return ranked.filter(
      ({ album }) => fold(album.title).includes(needle) || fold(album.artist).includes(needle),
    )
  }, [ranked, query])

  const detailEntry = ranked.find(({ album }) => album.id === detailId) ?? null

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

          <div className="flex items-center gap-2">
            {isAdmin ? (
              <>
                <Button variant="outline" onClick={() => void handleLogout()}>
                  <LogOut className="h-4 w-4" />
                  Déconnexion
                </Button>
                <Button onClick={openAdd}>
                  <Plus className="h-4 w-4" />
                  Ajouter
                </Button>
              </>
            ) : (
              <Link href="/login" className={buttonVariants({ variant: "outline" })}>
                <LogIn className="h-4 w-4" />
                Connexion
              </Link>
            )}
          </div>
        </header>

        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <ListTabs counts={counts} />
          <AlbumSearch value={query} onChange={setQuery} resultCount={visible.length} />
        </div>

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

        {albums.length === 0 ? (
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
            <p className="text-sm text-muted-foreground">
              Aucun album ne correspond à « {query} ».
            </p>
            <button
              onClick={() => setQuery("")}
              className="font-mono text-xs uppercase tracking-widest text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Effacer la recherche
            </button>
          </div>
        ) : (
          <div
            className={`grid grid-cols-2 gap-x-3 gap-y-6 transition-opacity sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 ${
              pending ? "opacity-70" : ""
            }`}
          >
            {visible.map(({ album, rank }) => (
              <AlbumCard key={album.id} album={album} rank={rank} onOpen={() => setDetailId(album.id)} />
            ))}
          </div>
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
