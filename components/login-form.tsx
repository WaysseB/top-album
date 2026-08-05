"use client"

import type React from "react"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { loginAction } from "@/app/actions"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"

export function LoginForm() {
  const router = useRouter()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [submitting, setSubmitting] = useState(false)

  const field =
    "w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none ring-ring placeholder:text-muted-foreground focus-visible:ring-2"

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const result = await loginAction(username, password)
    setSubmitting(false)

    if (!result.ok) {
      setError(result.error)
      setPassword("")
      return
    }

    startTransition(() => {
      router.replace("/")
      router.refresh()
    })
  }

  const busy = submitting || pending

  return (
    <div className="w-full max-w-sm">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-widest text-muted-foreground outline-none ring-ring transition-colors hover:text-foreground focus-visible:ring-2"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Retour au classement
      </Link>

      <div className="rounded-xl border border-border bg-card p-6 shadow-2xl">
        <h1 className="mb-1 text-lg font-semibold text-foreground">Connexion</h1>
        <p className="mb-5 text-sm text-muted-foreground">
          Réservé à l&apos;administration du classement.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="username" className="text-xs font-medium text-muted-foreground">
              Identifiant
            </label>
            <input
              id="username"
              className={field}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-xs font-medium text-muted-foreground">
              Mot de passe
            </label>
            <input
              id="password"
              type="password"
              className={field}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <p role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" disabled={busy}>
            {busy ? "Connexion…" : "Se connecter"}
          </Button>
        </form>
      </div>
    </div>
  )
}
