"use client"

import { useEffect } from "react"

/**
 * Enregistre le service worker, requis pour que le telephone propose
 * l'installation. Volontairement inactif en developpement : un worker
 * resident brouille le rechargement a chaud.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return
    if (!("serviceWorker" in navigator)) return

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Un echec d'enregistrement ne doit pas casser la page : l'application
        // fonctionne sans, on perd seulement l'installation.
      })
    }

    if (document.readyState === "complete") {
      register()
      return
    }
    window.addEventListener("load", register)
    return () => window.removeEventListener("load", register)
  }, [])

  return null
}
