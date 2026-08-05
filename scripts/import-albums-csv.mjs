/**
 * Importe dans `public.albums` un CSV produit par scripts/topster-to-csv.mjs.
 *
 *   node --env-file=.env.local scripts/import-albums-csv.mjs "<fichier.csv>" --dry-run
 *   node --env-file=.env.local scripts/import-albums-csv.mjs "<fichier.csv>"
 *
 * Les positions sont recalculees a la suite de ce qui existe deja dans la
 * liste visee : relancer le script n'ecrase donc jamais de lignes existantes,
 * il en ajoute. Les doublons (meme artiste + meme titre) sont ignores.
 */

import fs from "node:fs"
import { createClient } from "@supabase/supabase-js"

const [file] = process.argv.slice(2).filter((a) => !a.startsWith("--"))
const DRY_RUN = process.argv.includes("--dry-run")

if (!file) {
  console.error('Usage : node --env-file=.env.local scripts/import-albums-csv.mjs "<fichier.csv>" [--dry-run]')
  process.exit(1)
}

/** Analyseur CSV minimal, suffisant pour le format que nous produisons (RFC 4180). */
function parseCsv(text) {
  const rows = []
  let row = []
  let value = ""
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          value += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        value += char
      }
      continue
    }

    if (char === '"') quoted = true
    else if (char === ",") {
      row.push(value)
      value = ""
    } else if (char === "\n") {
      row.push(value)
      rows.push(row)
      row = []
      value = ""
    } else if (char !== "\r") value += char
  }

  if (value || row.length) {
    row.push(value)
    rows.push(row)
  }
  return rows.filter((r) => r.some((cell) => cell !== ""))
}

const [header, ...lines] = parseCsv(fs.readFileSync(file, "utf8"))
const records = lines.map((line) => Object.fromEntries(header.map((col, i) => [col.trim(), line[i] ?? ""])))

if (!records.length) {
  console.error("Aucune ligne exploitable dans ce fichier.")
  process.exit(1)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

const fold = (value) =>
  (value ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "")
const key = (album) => `${fold(album.artist)}|${fold(album.title)}`

const { data: existing, error } = await supabase.from("albums").select("list, title, artist, position")
if (error) throw new Error(`Lecture de la base impossible : ${error.message}`)

const known = new Set(existing.map(key))
const lastPosition = {}
for (const album of existing) {
  lastPosition[album.list] = Math.max(lastPosition[album.list] ?? 0, album.position ?? 0)
}

const skipped = records.filter((r) => known.has(key(r)))
const toInsert = records.filter((r) => !known.has(key(r)))

const payload = toInsert.map((record) => {
  const list = record.list === "wannabe" ? "wannabe" : "top"
  lastPosition[list] = (lastPosition[list] ?? 0) + 1
  return {
    list,
    position: lastPosition[list],
    title: record.title,
    artist: record.artist ?? "",
    year: record.year ?? "",
    cover: record.cover ?? "",
  }
})

console.log(`${records.length} ligne(s) lue(s)`)
if (skipped.length) console.log(`${skipped.length} deja en base, ignoree(s)`)
console.log(`${payload.length} a inserer${DRY_RUN ? "  [DRY RUN : aucune ecriture]" : ""}`)

if (payload.length) {
  const first = payload[0]
  const last = payload[payload.length - 1]
  console.log(`   ${first.list}#${first.position}  ${first.artist} - ${first.title}`)
  console.log(`   ...`)
  console.log(`   ${last.list}#${last.position}  ${last.artist} - ${last.title}`)
}

if (DRY_RUN || !payload.length) process.exit(0)

// Insertion par lots, pour ne pas envoyer une requete demesuree.
const BATCH = 50
let inserted = 0
for (let i = 0; i < payload.length; i += BATCH) {
  const chunk = payload.slice(i, i + BATCH)
  const { error: writeError } = await supabase.from("albums").insert(chunk)
  if (writeError) throw new Error(`Insertion impossible : ${writeError.message}`)
  inserted += chunk.length
  console.log(`   ${inserted}/${payload.length}`)
}

console.log(`\n${inserted} album(s) inseres.`)
