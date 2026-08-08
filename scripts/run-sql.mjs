/**
 * Applique un fichier SQL sur la base Supabase.
 *
 *   node --env-file=.env.local scripts/run-sql.mjs supabase/migration-6.sql
 *
 * L'API Supabase (PostgREST) ne sait pas executer de DDL : creer une colonne
 * ou modifier une contrainte demande une vraie connexion Postgres, d'ou
 * `POSTGRES_URL` et le client `pg`.
 *
 * Le fichier est envoye d'un bloc, et non decoupe sur les points-virgules :
 * nos migrations contiennent des blocs `do $$ ... $$` qui en comportent.
 */

import fs from "node:fs"
import pg from "pg"

const file = process.argv[2]
if (!file) {
  console.error("Usage : node --env-file=.env.local scripts/run-sql.mjs <fichier.sql>")
  process.exit(1)
}

const url = process.env.POSTGRES_URL
if (!url) {
  console.error("POSTGRES_URL manquante dans .env.local (connexion directe, port 5432).")
  process.exit(1)
}

const sql = fs.readFileSync(file, "utf8")
console.log(`${file} — ${sql.split("\n").length} lignes\n`)

/**
 * `sslmode` est retire de l'URL : les versions recentes du client le traduisent
 * en `verify-full`, ce qui ecrase la configuration ci-dessous et fait echouer la
 * connexion — le pooler Supabase presente une chaine auto-signee que le magasin
 * de certificats de Node ne connait pas.
 */
const connectionString = (() => {
  const parsed = new URL(url)
  parsed.searchParams.delete("sslmode")
  return parsed.toString()
})()

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } })

try {
  await client.connect()
  const results = await client.query(sql)
  const list = Array.isArray(results) ? results : [results]

  for (const result of list) {
    if (result.command && result.rowCount !== null && !result.rows?.length) {
      console.log(`${result.command} — ${result.rowCount} ligne(s)`)
    }
    if (result.rows?.length) {
      console.log(`${result.command ?? "SELECT"} :`)
      console.table(result.rows)
    }
  }
  console.log("\nMigration appliquee.")
} catch (error) {
  console.error("\nECHEC :", error.message)
  if (error.position) console.error("position :", error.position)
  process.exitCode = 1
} finally {
  await client.end()
}
