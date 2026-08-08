export function ErrorPanel({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md rounded-xl border border-destructive/50 bg-destructive/10 p-6">
        <h1 className="mb-2 text-lg font-semibold text-foreground text-balance">{title}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground text-pretty">{detail}</p>
      </div>
    </main>
  )
}
