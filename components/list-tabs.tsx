"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ALBUM_LISTS, LIST_PATHS, LIST_TAB_LABELS, type ListCounts } from "@/lib/albums"
import { BarChart3 } from "lucide-react"

type Props = {
  counts: ListCounts
}

const STATS_PATH = "/stats"

/**
 * Onglet et lien Stats partagent exactement le meme habillage : c'est une barre
 * de navigation, pas un filtre de liste avec un lien en plus.
 *
 * Tous portent `prefetch` : les routes etant dynamiques, le prechargement
 * automatique de Next ne recupere rien d'utile sans lui. Il ne coute presque
 * rien depuis que la collection est chargee par le layout partage — le segment
 * precharge se reduit au composant de page et a son onglet.
 */
function tabClass(active: boolean): string {
  return `flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium outline-none ring-ring transition-colors focus-visible:ring-2 ${
    active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
  }`
}

export function ListTabs({ counts }: Props) {
  const pathname = usePathname()

  return (
    // Le trait de separation est un `box-shadow` interieur, et non une bordure :
    // avec une bordure, les onglets doivent la chevaucher par un `-mb-px`, et ce
    // pixel qui depasse suffit a declencher une barre de defilement verticale
    // des lors que le defilement horizontal est actif.
    <nav
      aria-label="Navigation"
      className="flex items-center gap-1 overflow-x-auto shadow-[inset_0_-1px_0_0_var(--color-border)]"
    >
      {ALBUM_LISTS.map((list) => {
        const href = LIST_PATHS[list]
        const active = pathname === href

        return (
          <Link
            key={list}
            href={href}
            prefetch
            aria-current={active ? "page" : undefined}
            className={tabClass(active)}
          >
            {LIST_TAB_LABELS[list]}
            <span
              className={`rounded-full px-1.5 py-0.5 font-mono text-xs tabular-nums ${
                active ? "bg-primary/15 text-foreground" : "bg-secondary text-muted-foreground"
              }`}
            >
              {counts[list]}
            </span>
          </Link>
        )
      })}

      {/* Separateur : les stats portent sur toutes les listes, elles ne sont pas
          une liste de plus. */}
      <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden="true" />

      <Link
        href={STATS_PATH}
        prefetch
        aria-current={pathname === STATS_PATH ? "page" : undefined}
        className={tabClass(pathname === STATS_PATH)}
      >
        <BarChart3 className="h-4 w-4" aria-hidden="true" />
        Stats
      </Link>
    </nav>
  )
}
