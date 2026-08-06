"use server"

import { revalidatePath } from "next/cache"
import type { Album, AlbumInput } from "@/lib/albums"
import { createSession, destroySession, requireAdmin } from "@/lib/auth/session"
import { verifyPassword } from "@/lib/auth/password"
import { findAdminByUsername } from "@/lib/supabase/admin-users"
import { deleteAlbum, insertAlbum, reorderAlbums, updateAlbum } from "@/lib/supabase/albums"

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string }

/**
 * Les Server Actions ne doivent pas laisser fuir une stack Postgres vers le
 * navigateur : on journalise cote serveur et on renvoie un message lisible.
 */
async function run<T>(label: string, fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn()
    revalidatePath("/")
    revalidatePath("/wannabe")
    return { ok: true, data }
  } catch (error) {
    console.error(`[albums] ${label}`, error)
    return { ok: false, error: error instanceof Error ? error.message : "Erreur inattendue." }
  }
}

// ------------------------------------------------------------------
//  Authentification
// ------------------------------------------------------------------

export async function loginAction(username: string, password: string): Promise<ActionResult> {
  try {
    const account = await findAdminByUsername((username ?? "").trim())

    // Message unique quel que soit le motif : inutile d'indiquer lequel
    // des deux champs est faux.
    if (!account || !verifyPassword(password ?? "", account.password_hash)) {
      return { ok: false, error: "Identifiant ou mot de passe incorrect." }
    }

    await createSession(account.username)
    revalidatePath("/", "layout")
    return { ok: true, data: undefined }
  } catch (error) {
    console.error("[auth] login", error)
    return { ok: false, error: "Connexion impossible." }
  }
}

export async function logoutAction(): Promise<void> {
  await destroySession()
  revalidatePath("/", "layout")
}

// ------------------------------------------------------------------
//  Ecritures — toutes derriere requireAdmin()
// ------------------------------------------------------------------

export async function createAlbumAction(input: AlbumInput): Promise<ActionResult<Album>> {
  return run("create", async () => {
    await requireAdmin()
    return insertAlbum(input)
  })
}

export async function updateAlbumAction(id: string, input: AlbumInput): Promise<ActionResult<Album>> {
  return run("update", async () => {
    await requireAdmin()
    return updateAlbum(id, input)
  })
}

export async function deleteAlbumAction(id: string): Promise<ActionResult> {
  return run("delete", async () => {
    await requireAdmin()
    return deleteAlbum(id)
  })
}

export async function reorderAlbumsAction(ids: string[]): Promise<ActionResult> {
  return run("reorder", async () => {
    await requireAdmin()
    return reorderAlbums(ids)
  })
}
