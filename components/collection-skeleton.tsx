/**
 * Ossature affichee pendant le chargement de la collection.
 *
 * Elle reprend la structure exacte de la vraie page — titre, onglets, filtres,
 * grille — pour que l'arrivee du contenu ne provoque aucun saut de mise en page.
 *
 * Les proportions comptent plus que le detail : ce que l'oeil doit comprendre,
 * c'est « une grille de pochettes se prepare », pas « voici de faux albums ».
 */
export function CollectionSkeleton() {
  return (
    <main className="min-h-screen px-4 py-10 sm:px-8 lg:px-12" aria-busy="true" aria-live="polite">
      <span className="sr-only">Chargement de la collection…</span>

      <div className="mx-auto max-w-6xl animate-pulse">
        <header className="mb-6 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-2">
            <div className="h-3 w-24 rounded bg-secondary" />
            <div className="h-9 w-64 rounded bg-secondary" />
            <div className="h-4 w-48 rounded bg-secondary/70" />
          </div>
          <div className="flex gap-2">
            <div className="h-10 w-28 rounded-lg bg-secondary sm:h-8" />
            <div className="h-10 w-24 rounded-lg bg-secondary sm:h-8" />
          </div>
        </header>

        <div className="mb-4 flex items-center gap-1 shadow-[inset_0_-1px_0_0_var(--color-border)]">
          {[64, 88, 56, 72, 60].map((width, index) => (
            <div key={index} className="px-4 py-2.5">
              <div className="h-5 rounded bg-secondary" style={{ width }} />
            </div>
          ))}
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          {[72, 96, 64, 88, 56, 80].map((width, index) => (
            <div key={index} className="h-8 rounded-full bg-secondary/70" style={{ width }} />
          ))}
        </div>

        {/* Une vingtaine de vignettes suffit : le reste est sous la ligne de
            flottaison et n'apporterait que du bruit. */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 20 }, (_, index) => (
            <div key={index} className="flex flex-col gap-2">
              <div className="aspect-square w-full rounded-md bg-secondary" />
              <div className="h-4 w-4/5 rounded bg-secondary/70" />
              <div className="h-3 w-3/5 rounded bg-secondary/50" />
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
