import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { LoginForm } from "@/components/login-form"
import { isAdmin } from "@/lib/auth/session"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Connexion",
}

export default async function Page() {
  // Deja connecte : inutile d'afficher le formulaire.
  if (await isAdmin()) redirect("/")

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <LoginForm />
    </main>
  )
}
