/**
 * Pays de l'artiste, stocke sous forme de code ISO 3166-1 alpha-2.
 *
 * Le libelle n'est jamais enregistre : il est traduit au rendu par
 * `Intl.DisplayNames`, ce qui evite de maintenir une table de noms.
 */

/** Codes ISO 3166-1 alpha-2 en vigueur, pour la liste du formulaire. */
const ISO_CODES =
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ " +
  "BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ " +
  "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ " +
  "DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR " +
  "GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY " +
  "HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP " +
  "KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY " +
  "MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ " +
  "NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY " +
  "QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ " +
  "TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ " +
  "VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"

export const COUNTRY_CODES: string[] = ISO_CODES.split(" ")

/**
 * Pays disparus, que MusicBrainz attribue encore a des artistes de l'epoque.
 * `Intl` ne les connait pas tous, et rendrait le code brut.
 */
const HISTORICAL: Record<string, string> = {
  SU: "URSS",
  YU: "Yougoslavie",
  CS: "Serbie-et-Monténégro",
  XC: "Tchécoslovaquie",
  XG: "Allemagne de l'Est",
  XK: "Kosovo",
}

const COUNTRY_RE = /^[A-Z]{2}$/

let displayNames: Intl.DisplayNames | null = null

/** « GB » -> « Royaume-Uni ». Le code est rendu tel quel s'il est inconnu. */
export function countryName(code: string): string {
  if (HISTORICAL[code]) return HISTORICAL[code]
  try {
    displayNames ??= new Intl.DisplayNames(["fr"], { type: "region" })
    return displayNames.of(code) ?? code
  } catch {
    return code
  }
}

/** Code valide, en majuscules, ou undefined. */
export function normalizeCountry(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const code = value.trim().toUpperCase()
  return COUNTRY_RE.test(code) ? code : undefined
}

let sortedOptions: { code: string; name: string }[] | null = null

/** Les pays du formulaire, tries sur leur nom francais. */
export function countryOptions(): { code: string; name: string }[] {
  sortedOptions ??= COUNTRY_CODES.map((code) => ({ code, name: countryName(code) })).sort((a, b) =>
    a.name.localeCompare(b.name, "fr"),
  )
  return sortedOptions
}
