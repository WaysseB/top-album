"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ALBUM_LISTS, LIST_PATHS, LIST_TAB_LABELS, type ListCounts } from "@/lib/albums"
import { BarChart3 } from "lucide-react"

type Props = {
  counts: ListCounts
}

export function ListTabs({ counts }: Props) {
  const pathname = usePathname()

  return (
    // `overflow-x-auto` : trois onglets et leurs compteurs debordent sur un
    // telephone etroit. Le lien Stats est pousse a droite, hors du groupe.
    <nav
      aria-label="Listes d'albums"
      className="flex items-center gap-1 overflow-x-auto border-b border-border"
    >
      {ALBUM_LISTS.map((list) => {
        const href = LIST_PATHS[list]
        const active = pathname === href

        return (
          <Link
            key={list}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium outline-none ring-ring transition-colors focus-visible:ring-2 ${
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {LIST_TAB_LABELS[list]}
            <span
              className={`rounded-full px-1.5 py-0.5 font-mono text-xs ${
                active ? "bg-primary/15 text-foreground" : "bg-secondary text-muted-foreground"
              }`}
            >
              {counts[list]}
            </span>
          </Link>
        )
      })}

      <Link
        href="/stats"
        className="-mb-px ml-auto flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-4 py-2.5 text-sm font-medium text-muted-foreground outline-none ring-ring transition-colors hover:text-foreground focus-visible:ring-2"
      >
        <BarChart3 className="h-4 w-4" aria-hidden="true" />
        Stats
      </Link>
    </nav>
  )
}
