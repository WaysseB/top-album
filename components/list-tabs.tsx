"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ALBUM_LISTS, LIST_PATHS, LIST_TAB_LABELS, type ListCounts } from "@/lib/albums"

type Props = {
  counts: ListCounts
}

export function ListTabs({ counts }: Props) {
  const pathname = usePathname()

  return (
    <nav aria-label="Listes d'albums" className="flex items-center gap-1 border-b border-border">
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
    </nav>
  )
}
