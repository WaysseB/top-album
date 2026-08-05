/**
 * Pre-remplit la colonne `deezer_url` en interrogeant l'API publique de Deezer.
 *
 *   node --env-file=.env.local scripts/fill-deezer-links.mjs --dry-run
 *   node --env-file=.env.local scripts/fill-deezer-links.mjs --limit 10
 *   node --env-file=.env.local scripts/fill-deezer-links.mjs
 *
 * Outil de developpement : il utilise la cle service_role et n'a rien a faire
 * dans l'application. Les albums deja pourvus d'un lien sont ignores.
 *
 * La logique de recherche et de correspondance vit dans ./deezer-match.mjs,
 * pour rester testable sans acces a la base.
 */

import { createClient } from "@supabase/supabase-js"
import { DELAY_MS, findAlbum, sleep } from "./deezer-match.mjs"

const DRY_RUN = process.argv.includes("--dry-run")
const LIMIT = (() => {
  const index = process.argv.indexOf("--limit")
  if (index === -1) return Infinity
  const value = Number.parseInt(process.argv[index + 1] ?? "", 10)
  return Number.isFinite(value) && value > 0 ? value : Infinity
})()

function env(names) {
  for (const name of names) {
    const value = process.env[name]
    if (value && value.trim()) return value.trim()
  }
  throw new Error(`Variable d'environnement manquante : ${names.join(" ou ")}`)
}

const supabase = createClient(
  env(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"]),
  env(["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"]),
  { auth: { persistSession: false, autoRefreshToken: false } },
)

async function main() {
  const { data, error } = await supabase
    .from("albums")
    .select("id, list, position, title, artist, deezer_url")
    .or("deezer_url.is.null,deezer_url.eq.")
    .order("list", { ascending: true })
    .order("position", { ascending: true })

  if (error) throw new Error(`Lecture impossible : ${error.message}`)

  const todo = LIMIT === Infinity ? data : data.slice(0, LIMIT)
  console.log(
    `${data.length} album(s) sans lien Deezer` +
      (todo.length < data.length ? `, ${todo.length} traite(s) (--limit)` : "") +
      (DRY_RUN ? "  [DRY RUN : aucune ecriture]" : ""),
  )
  console.log()

  let matched = 0
  const unmatched = []

  for (const album of todo) {
    let hit = null
    let failure = null

    try {
      hit = await findAlbum(album.artist ?? "", album.title)
    } catch (err) {
      failure = err instanceof Error ? err.message : String(err)
    }

    const where = `${album.list}#${album.position}`.padEnd(12)
    const who = `${album.artist} - ${album.title}`

    if (failure) {
      console.log(`ERR  ${where} ${who}\n       ${failure}`)
      unmatched.push(album)
    } else if (!hit) {
      console.log(`--   ${where} ${who}`)
      unmatched.push(album)
    } else {
      console.log(`OK   ${where} ${who}\n       -> ${hit.artist.name} - ${hit.title}  ${hit.link}`)
      matched++

      if (!DRY_RUN) {
        const { error: writeError } = await supabase
          .from("albums")
          .update({ deezer_url: hit.link })
          .eq("id", album.id)

        if (writeError) {
          console.log(`       ecriture impossible : ${writeError.message}`)
          matched--
          unmatched.push(album)
        }
      }
    }

    await sleep(DELAY_MS)
  }

  console.log()
  console.log(`${matched}/${todo.length} correspondance(s)${DRY_RUN ? " (rien ecrit)" : " enregistree(s)"}`)

  if (unmatched.length) {
    console.log(`\n${unmatched.length} album(s) a completer a la main :`)
    for (const album of unmatched) {
      console.log(`  ${album.list}#${album.position}  ${album.artist} - ${album.title}`)
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
