/**
 * Rapatrie les pochettes distantes dans Supabase Storage.
 *
 *   node --env-file=.env.local scripts/backfill-covers.mjs --dry-run --limit 10
 *   node --env-file=.env.local scripts/backfill-covers.mjs
 *
 * Options :
 *   --dry-run   telecharge et redimensionne, mais n'ecrit ni fichier ni ligne
 *   --limit N   ne traite que les N premieres pochettes
 *
 * Le formulaire fait deja ce travail a l'ajout d'un album (voir `lib/covers.ts`).
 * Ce script sert a deux choses : traiter les albums anterieurs, et rattraper
 * ceux dont le rapatriement avait echoue — un hote lent, une panne passagere.
 * Il est donc rejouable sans risque : ce qui est deja heberge est ignore.
 *
 * L'enjeu n'est pas seulement le poids. 230 pochettes pointent aujourd'hui vers
 * des hotes tiers quelconques, herites de l'import Topsters : le jour ou l'un
 * d'eux disparait, la pochette disparait avec lui.
 */

import { createHash } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import sharp from "sharp"

const DRY_RUN = process.argv.includes("--dry-run")
const LIMIT = (() => {
  const index = process.argv.indexOf("--limit")
  if (index === -1) return Infinity
  const value = Number.parseInt(process.argv[index + 1] ?? "", 10)
  return Number.isFinite(value) && value > 0 ? value : Infinity
})()

const BUCKET = "covers"
const SIZE = 500
const QUALITY = 80
const TIMEOUT_MS = 15000
const MAX_BYTES = 12 * 1024 * 1024

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "")
const PUBLIC_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`

const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const objectName = (url) => `${createHash("sha256").update(url).digest("hex").slice(0, 32)}.webp`

async function download(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "User-Agent": "MonTopAlbums/1.0", Accept: "image/*" },
    referrer: "",
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)

  const type = response.headers.get("content-type") ?? ""
  if (!type.startsWith("image/")) throw new Error(`type inattendu : ${type || "inconnu"}`)

  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.byteLength === 0) throw new Error("reponse vide")
  if (buffer.byteLength > MAX_BYTES) throw new Error("image trop lourde")
  return buffer
}

const { data: albums, error } = await supabase
  .from("albums")
  .select("id, list, artist, title, cover")
  .neq("cover", "")
  .not("cover", "like", `${PUBLIC_PREFIX}%`)
  .order("list")

if (error) {
  console.error(`Lecture impossible : ${error.message}`)
  process.exit(1)
}

const todo = albums.slice(0, LIMIT === Infinity ? undefined : LIMIT)
console.log(`${albums.length} pochette(s) distante(s)${todo.length < albums.length ? `, ${todo.length} traitee(s)` : ""}`)
if (DRY_RUN) console.log("Mode --dry-run : rien ne sera ecrit.\n")

// Les pochettes deja presentes dans le bucket ne sont pas retelechargees : deux
// albums peuvent partager la meme image, et le script est rejouable.
const present = new Set()
for (let offset = 0; ; offset += 100) {
  const { data: files } = await supabase.storage.from(BUCKET).list("", { limit: 100, offset })
  if (!files?.length) break
  for (const file of files) present.add(file.name)
  if (files.length < 100) break
}
console.log(`${present.size} fichier(s) deja dans le bucket\n`)

let ok = 0
let reused = 0
let failed = 0
let sourceBytes = 0
let storedBytes = 0
const failures = []

for (let index = 0; index < todo.length; index++) {
  const album = todo[index]
  const name = objectName(album.cover)
  const label = `${album.artist} — ${album.title}`

  try {
    let stored = 0

    if (present.has(name)) {
      reused += 1
    } else {
      const original = await download(album.cover)
      const webp = await sharp(original)
        .resize(SIZE, SIZE, { fit: "cover", withoutEnlargement: true })
        .webp({ quality: QUALITY })
        .toBuffer()

      sourceBytes += original.byteLength
      storedBytes += webp.byteLength
      stored = webp.byteLength

      if (!DRY_RUN) {
        const { error: uploadError } = await supabase.storage.from(BUCKET).upload(name, webp, {
          contentType: "image/webp",
          cacheControl: "31536000",
          upsert: true,
        })
        if (uploadError) throw new Error(uploadError.message)
      }
      present.add(name)
    }

    if (!DRY_RUN) {
      const { error: updateError } = await supabase
        .from("albums")
        .update({ cover: PUBLIC_PREFIX + name, cover_source: album.cover })
        .eq("id", album.id)
      if (updateError) throw new Error(updateError.message)
    }

    ok += 1
    if ((index + 1) % 25 === 0 || index === todo.length - 1) {
      console.log(`  ${index + 1}/${todo.length}  ${label}${stored ? ` — ${Math.round(stored / 1024)} Ko` : " (deja stockee)"}`)
    }
  } catch (cause) {
    failed += 1
    failures.push({ label, cover: album.cover, reason: cause.message })
  }
}

console.log(`\n${ok} traitee(s), dont ${reused} deja presente(s) dans le bucket`)
if (sourceBytes > 0) {
  console.log(
    `${(sourceBytes / 1024 / 1024).toFixed(1)} Mo telecharges → ${(storedBytes / 1024 / 1024).toFixed(1)} Mo stockes ` +
      `(${Math.round((1 - storedBytes / sourceBytes) * 100)} % de moins)`,
  )
}

if (failures.length > 0) {
  console.log(`\n${failed} echec(s) — l'URL distante est conservee, relancez le script plus tard :`)
  for (const failure of failures.slice(0, 20)) {
    console.log(`  · ${failure.label} : ${failure.reason}`)
  }
  if (failures.length > 20) console.log(`  · … ${failures.length - 20} autres`)
}
