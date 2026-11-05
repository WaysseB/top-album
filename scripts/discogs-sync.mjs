/**
 * Synchronise la collection Discogs dans la liste « vinyl ».
 *
 *   node --env-file=.env.local scripts/discogs-sync.mjs --dry-run
 *   node --env-file=.env.local scripts/discogs-sync.mjs --dry-run --raw
 *   node --env-file=.env.local scripts/discogs-sync.mjs
 *   node --env-file=.env.local scripts/discogs-sync.mjs --prune
 *   node --env-file=.env.local scripts/discogs-sync.mjs --refresh
 *
 * Variables attendues dans .env.local :
 *   DISCOGS_USERNAME  votre identifiant Discogs (celui de l'URL du profil)
 *   DISCOGS_TOKEN     Settings > Developers > Generate token
 *
 * Options :
 *   --dry-run   n'ecrit rien, affiche le plan
 *   --raw       affiche la premiere reponse brute, pour verifier le format
 *   --limit N   ne traite que les N premiers disques
 *   --prune     supprime les vinyles retires de la collection Discogs
 *   --all-formats  inclut les CD, cassettes et autres supports non vinyle
 *   --refresh   reapplique les donnees Discogs sur les fiches existantes
 *   --folder N  dossier Discogs (0 = la collection entiere, par defaut)
 *
 * La logique vit dans `lib/discogs-sync.mjs`, partagee avec le site : la
 * tache planifiee quotidienne (`app/api/cron/discogs`) et le bouton
 * « Synchroniser Discogs » de la page Vinyles. Ceux-ci n'ajoutent et ne
 * completent que — supprimer (`--prune`) ou ecraser (`--refresh`) reste
 * reserve a ce script, lance a la main.
 */

import { createClient } from "@supabase/supabase-js"
import { syncDiscogs } from "../lib/discogs-sync.mjs"

function numericArg(flag, fallback) {
  const index = process.argv.indexOf(flag)
  if (index === -1) return fallback
  const value = Number.parseInt(process.argv[index + 1] ?? "", 10)
  return Number.isFinite(value) ? value : fallback
}

if (!process.env.DISCOGS_USERNAME) {
  console.error("DISCOGS_USERNAME est attendu dans .env.local.")
  process.exit(1)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

syncDiscogs({
  supabase,
  username: process.env.DISCOGS_USERNAME,
  token: process.env.DISCOGS_TOKEN,
  options: {
    dryRun: process.argv.includes("--dry-run"),
    raw: process.argv.includes("--raw"),
    prune: process.argv.includes("--prune"),
    refresh: process.argv.includes("--refresh"),
    allFormats: process.argv.includes("--all-formats"),
    limit: numericArg("--limit", Infinity),
    folder: numericArg("--folder", 0),
  },
}).catch((error) => {
  console.error(`\nECHEC : ${error.message}`)
  process.exitCode = 1
})
