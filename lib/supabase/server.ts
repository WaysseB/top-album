import { createClient, type SupabaseClient } from "@supabase/supabase-js"

// Ce module ne doit jamais etre importe depuis un composant client :
// il manipule la cle service_role.

/**
 * Lit la premiere variable d'environnement renseignee parmi `names`.
 * L'integration Supabase de Vercel n'injecte pas toujours les memes noms
 * selon la date de creation du projet, d'ou les alternatives.
 */
function readEnv(names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]
    if (value && value.trim()) return value.trim()
  }
  return undefined
}

function requireEnv(names: string[]): string {
  const value = readEnv(names)
  if (!value) {
    throw new Error(
      `Configuration Supabase incomplete : renseignez ${names[0]} ` +
        `(alternatives acceptees : ${names.slice(1).join(", ") || "aucune"}).`,
    )
  }
  return value
}

const URL_KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"]

const ANON_KEYS = [
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
]

const SERVICE_KEYS = ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"]

const OPTIONS = { auth: { persistSession: false, autoRefreshToken: false } }

let readClient: SupabaseClient | null = null
let writeClient: SupabaseClient | null = null

/** Client de lecture : cle anon, soumis aux policies RLS. */
export function supabaseRead(): SupabaseClient {
  if (!readClient) {
    readClient = createClient(requireEnv(URL_KEYS), requireEnv(ANON_KEYS), OPTIONS)
  }
  return readClient
}

/**
 * Client d'ecriture : cle service_role, contourne RLS.
 * Reserve aux Server Actions — cette cle ne doit jamais atteindre le navigateur.
 */
export function supabaseWrite(): SupabaseClient {
  if (!writeClient) {
    writeClient = createClient(requireEnv(URL_KEYS), requireEnv(SERVICE_KEYS), OPTIONS)
  }
  return writeClient
}

/** True si les variables de lecture sont presentes (pour un message d'erreur clair). */
export function isSupabaseConfigured(): boolean {
  return Boolean(readEnv(URL_KEYS) && readEnv(ANON_KEYS))
}
