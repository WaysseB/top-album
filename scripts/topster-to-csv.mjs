/**
 * Convertit un export Topsters (.topster) en CSV importable dans la table
 * `public.albums` de Supabase.
 *
 *   node --env-file=.env.local scripts/topster-to-csv.mjs "<fichier.topster>" <liste> "<sortie.csv>"
 *
 * Exemple :
 *   node --env-file=.env.local scripts/topster-to-csv.mjs "C:/.../Contenders.topster" wannabe "C:/.../wannabe.csv"
 *
 * Les albums deja presents en base (meme artiste + meme titre, aux accents et
 * a la ponctuation pres) sont ecartes : un second fichier `-avec-doublons.csv`
 * est produit si l'on souhaite malgre tout tout importer.
 *
 * Format Topsters 3 : base64 -> "120,156,..." (octets) -> zlib -> JSON.
 */

import fs from "node:fs"
import zlib from "node:zlib"
import { createClient } from "@supabase/supabase-js"

const [source, list = "wannabe", output] = process.argv.slice(2)

if (!source || !output) {
  console.error('Usage : node --env-file=.env.local scripts/topster-to-csv.mjs "<fichier.topster>" <top|wannabe> "<sortie.csv>"')
  process.exit(1)
}
if (list !== "top" && list !== "wannabe") {
  console.error(`Liste inconnue : "${list}" (attendu : top ou wannabe)`)
  process.exit(1)
}

// ------------------------------------------------------------------
// 1. Decodage
// ------------------------------------------------------------------
const raw = fs.readFileSync(source, "utf8").trim()
const byteList = Buffer.from(raw, "base64").toString("utf8")

if (!/^\d+(\s*,\s*\d+)*$/.test(byteList.trim())) {
  console.error("Ce fichier n'a pas la forme attendue d'un export Topsters 3.")
  process.exit(1)
}

const chart = Object.values(JSON.parse(zlib.inflateSync(Buffer.from(byteList.split(",").map(Number))).toString("utf8")))[0]

console.log(`chart  : ${chart.data.title}`)
console.log(`grille : ${chart.data.size.x}x${chart.data.size.y} (${chart.data.items.length} cases)`)

// ------------------------------------------------------------------
// 2. Extraction — l'artiste est soit dans `creator`, soit en tete du titre
// ------------------------------------------------------------------
const SEPARATORS = [" - ", " – ", " — "]

function splitArtistTitle(rawTitle, knownArtist) {
  if (knownArtist) {
    for (const separator of SEPARATORS) {
      const prefix = knownArtist + separator
      if (rawTitle.toLowerCase().startsWith(prefix.toLowerCase())) {
        return { artist: knownArtist, title: rawTitle.slice(prefix.length).trim() }
      }
    }
    return { artist: knownArtist, title: rawTitle }
  }

  // Premier separateur seulement : "Artiste - Album - Deluxe" garde son album entier.
  let cut = -1
  let width = 0
  for (const separator of SEPARATORS) {
    const index = rawTitle.indexOf(separator)
    if (index > 0 && (cut === -1 || index < cut)) {
      cut = index
      width = separator.length
    }
  }
  if (cut === -1) return { artist: "", title: rawTitle }

  const artist = rawTitle.slice(0, cut).trim()
  const title = rawTitle.slice(cut + width).trim()
  return artist && title ? { artist, title } : { artist: "", title: rawTitle }
}

const albums = []
for (const item of chart.data.items) {
  if (!item?.title) continue // cases vides
  const { artist, title } = splitArtistTitle(item.title.trim(), (item.creator ?? "").trim())
  albums.push({ title, artist, cover: item.coverURL ?? "" })
}

console.log(`albums : ${albums.length}`)
const orphans = albums.filter((a) => !a.artist)
if (orphans.length) {
  console.log(`\n${orphans.length} album(s) sans artiste identifiable :`)
  for (const a of orphans) console.log(`   ${a.title}`)
}

// ------------------------------------------------------------------
// 3. Recoupement avec la base
// ------------------------------------------------------------------
const fold = (value) =>
  (value ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "")
const key = (album) => `${fold(album.artist)}|${fold(album.title)}`

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

const { data: existing, error } = await supabase.from("albums").select("list, title, artist")
if (error) throw new Error(`Lecture de la base impossible : ${error.message}`)

const known = new Map(existing.map((a) => [key(a), a.list]))
const duplicates = albums.filter((a) => known.has(key(a)))
const fresh = albums.filter((a) => !known.has(key(a)))

if (duplicates.length) {
  console.log(`\n${duplicates.length} album(s) deja en base :`)
  for (const d of duplicates) console.log(`   [${known.get(key(d))}] ${d.artist} - ${d.title}`)
}

// ------------------------------------------------------------------
// 4. CSV aux colonnes de la table
// ------------------------------------------------------------------
const COLUMNS = ["list", "position", "title", "artist", "year", "cover"]
const escape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`

function writeCsv(path, rows) {
  const lines = [COLUMNS.join(",")]
  rows.forEach((album, index) => {
    lines.push(
      [escape(list), escape(index + 1), escape(album.title), escape(album.artist), escape(""), escape(album.cover)].join(","),
    )
  })
  fs.writeFileSync(path, lines.join("\r\n"), "utf8")
  console.log(`\necrit : ${path}  (${rows.length} ligne(s))`)
}

writeCsv(output, fresh)
if (duplicates.length) writeCsv(output.replace(/\.csv$/i, "-avec-doublons.csv"), albums)
