import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto"

// Format stocke en base : scrypt$<sel base64>$<empreinte base64>
const SCHEME = "scrypt"
const SALT_BYTES = 16
const KEY_BYTES = 64

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES)
  const derived = scryptSync(password, salt, KEY_BYTES)
  return `${SCHEME}$${salt.toString("base64")}$${derived.toString("base64")}`
}

/**
 * Comparaison a temps constant : une comparaison naive laisserait fuir,
 * par le temps de reponse, le nombre d'octets corrects.
 */
export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltB64, hashB64] = (stored ?? "").split("$")
  if (scheme !== SCHEME || !saltB64 || !hashB64) return false

  let expected: Buffer
  let salt: Buffer
  try {
    expected = Buffer.from(hashB64, "base64")
    salt = Buffer.from(saltB64, "base64")
  } catch {
    return false
  }
  if (expected.length === 0 || salt.length === 0) return false

  const derived = scryptSync(password, salt, expected.length)
  return timingSafeEqual(expected, derived)
}
