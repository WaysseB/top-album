import { createHmac, timingSafeEqual } from "node:crypto"
import { cookies } from "next/headers"

const COOKIE_NAME = "top_albums_session"
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7 // 7 jours

type SessionPayload = {
  /** Nom d'utilisateur de l'administrateur connecte. */
  sub: string
  /** Expiration, en secondes depuis l'epoque. */
  exp: number
}

/**
 * Secret de signature. `AUTH_SECRET` est prefere ; a defaut on reutilise
 * le secret JWT deja fourni par l'integration Supabase de Vercel, ce qui
 * evite d'avoir a declarer une variable supplementaire pour deployer.
 */
function signingSecret(): string {
  const secret = process.env.AUTH_SECRET || process.env.SUPABASE_JWT_SECRET
  if (!secret) {
    throw new Error(
      "Signature de session impossible : renseignez AUTH_SECRET (ou SUPABASE_JWT_SECRET).",
    )
  }
  return secret
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

function sign(value: string): string {
  return base64url(createHmac("sha256", signingSecret()).update(value).digest())
}

function safeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB)
}

function serialize(payload: SessionPayload): string {
  const body = base64url(JSON.stringify(payload))
  return `${body}.${sign(body)}`
}

function deserialize(token: string): SessionPayload | null {
  const [body, signature] = (token ?? "").split(".")
  if (!body || !signature) return null

  // Signature verifiee AVANT toute lecture du contenu.
  if (!safeEquals(signature, sign(body))) return null

  try {
    const payload = JSON.parse(
      Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    ) as SessionPayload

    if (typeof payload?.sub !== "string" || typeof payload?.exp !== "number") return null
    if (payload.exp * 1000 < Date.now()) return null

    return payload
  } catch {
    return null
  }
}

export async function createSession(username: string): Promise<void> {
  const payload: SessionPayload = {
    sub: username,
    exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS,
  }

  const store = await cookies()
  store.set(COOKIE_NAME, serialize(payload), {
    httpOnly: true, // inaccessible au JavaScript de la page
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  })
}

export async function destroySession(): Promise<void> {
  const store = await cookies()
  store.delete(COOKIE_NAME)
}

/** Nom de l'administrateur connecte, ou null. */
export async function getSessionUser(): Promise<string | null> {
  const store = await cookies()
  const token = store.get(COOKIE_NAME)?.value
  if (!token) return null

  try {
    return deserialize(token)?.sub ?? null
  } catch {
    // Secret absent ou invalide : on considere qu'il n'y a pas de session.
    return null
  }
}

export async function isAdmin(): Promise<boolean> {
  return (await getSessionUser()) !== null
}

/**
 * A appeler en tete de CHAQUE action qui modifie des donnees.
 * Masquer un bouton ne protege rien : une Server Action reste appelable
 * directement, et la couche d'ecriture utilise la cle service_role.
 */
export async function requireAdmin(): Promise<string> {
  const user = await getSessionUser()
  if (!user) throw new Error("Vous devez être connecté pour effectuer cette action.")
  return user
}
