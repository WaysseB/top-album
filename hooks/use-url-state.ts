"use client"

import { useEffect, useRef } from "react"

/** Ce que l'URL doit refleter : la recherche, les filtres, les fiches ouvertes. */
export type UrlState = {
  query: string
  genre: string | null
  decade: string | null
  album: string | null
  about: boolean
}

const EMPTY: UrlState = { query: "", genre: null, decade: null, album: null, about: false }

export function readUrlState(search: string): UrlState {
  const params = new URLSearchParams(search)
  return {
    query: params.get("q") ?? "",
    genre: params.get("genre"),
    decade: params.get("decennie"),
    album: params.get("album"),
    about: params.get("apropos") === "1",
  }
}

function buildUrl(pathname: string, state: UrlState): string {
  const params = new URLSearchParams()
  if (state.query) params.set("q", state.query)
  if (state.genre) params.set("genre", state.genre)
  if (state.decade) params.set("decennie", state.decade)
  if (state.album) params.set("album", state.album)
  if (state.about) params.set("apropos", "1")

  const query = params.toString()
  return query ? `${pathname}?${query}` : pathname
}

/**
 * Maintient l'URL en accord avec l'etat affiche, et inversement.
 *
 * L'ecriture passe par l'API History du navigateur et NON par le routeur de
 * Next : `router.replace` reexecuterait le rendu serveur de la route, qui est
 * dynamique, et rechargerait donc toute la collection a chaque frappe dans le
 * champ de recherche.
 *
 * Deux gestes distincts :
 *
 *   - recherche et filtres remplacent l'entree courante. Ils sont partageables
 *     et survivent a un rafraichissement, mais n'encombrent pas l'historique
 *     d'une entree par caractere tape ;
 *   - l'ouverture d'une fiche EMPILE une entree, pour que le bouton Retour la
 *     referme. C'est le geste attendu sur telephone, ou l'on quitte une fiche
 *     par le retour systeme bien plus souvent que par la croix.
 */
export function useUrlState(
  pathname: string,
  state: UrlState,
  onRestore: (state: UrlState) => void,
): void {
  // Les deux fiches empilent une entree d'historique a l'ouverture ; on suit
  // donc leur etat precedent pour distinguer une ouverture d'un simple
  // changement de filtre.
  const previousAlbum = useRef(state.album)
  const previousAbout = useRef(state.about)

  // `onRestore` vit dans une reference : sans cela, l'abonnement a `popstate`
  // serait refait a chaque rendu, la fonction etant recreee a chaque fois.
  const restore = useRef(onRestore)
  useEffect(() => {
    restore.current = onRestore
  })

  useEffect(() => {
    const url = buildUrl(pathname, state)
    if (url === window.location.pathname + window.location.search) {
      previousAlbum.current = state.album
      previousAbout.current = state.about
      return
    }

    // Seule l'ouverture d'une fiche merite une entree d'historique. Sa fermeture
    // n'en cree pas : elle est deja obtenue par le retour arriere.
    const opening =
      (state.album !== null && previousAlbum.current === null) ||
      (state.about && !previousAbout.current)

    previousAlbum.current = state.album
    previousAbout.current = state.about

    if (opening) window.history.pushState(null, "", url)
    else window.history.replaceState(null, "", url)
  }, [pathname, state.query, state.genre, state.decade, state.album, state.about])

  useEffect(() => {
    const onPopState = () => restore.current(readUrlState(window.location.search))
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])
}

export { EMPTY as EMPTY_URL_STATE }
