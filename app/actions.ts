"use server"

import { revalidatePath } from "next/cache"
import type { Album, AlbumInput } from "@/lib/albums"
import {
  deleteAlbum,
  importAlbums,
  insertAlbum,
  reorderAlbums,
  updateAlbum,
} from "@/lib/supabase/albums"

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string }

/**
 * Les Server Actions ne doivent pas laisser fuir une stack Postgres vers le
 * navigateur : on journalise cote serveur et on renvoie un message lisible.
 */
async function run<T>(label: string, fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn()
    revalidatePath("/")
    return { ok: true, data }
  } catch (error) {
    console.error(`[albums] ${label}`, error)
    return { ok: false, error: error instanceof Error ? error.message : "Erreur inattendue." }
  }
}

export async function createAlbumAction(input: AlbumInput): Promise<ActionResult<Album>> {
  return run("create", () => insertAlbum(input))
}

export async function updateAlbumAction(id: string, input: AlbumInput): Promise<ActionResult<Album>> {
  return run("update", () => updateAlbum(id, input))
}

export async function deleteAlbumAction(id: string): Promise<ActionResult> {
  return run("delete", () => deleteAlbum(id))
}

export async function reorderAlbumsAction(ids: string[]): Promise<ActionResult> {
  return run("reorder", () => reorderAlbums(ids))
}

export async function importAlbumsAction(
  inputs: AlbumInput[],
  replace: boolean,
): Promise<ActionResult> {
  return run("import", () => importAlbums(inputs, replace))
}
