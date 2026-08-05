import { supabaseWrite } from "@/lib/supabase/server"

export type AdminUser = {
  id: string
  username: string
  password_hash: string
}

/**
 * Lit un compte administrateur.
 *
 * Volontairement via la cle service_role : la table `admin_users` n'a
 * aucune policy RLS, la cle anon exposee au navigateur ne peut donc
 * jamais atteindre les empreintes de mots de passe.
 */
export async function findAdminByUsername(username: string): Promise<AdminUser | null> {
  const { data, error } = await supabaseWrite()
    .from("admin_users")
    .select("id, username, password_hash")
    .ilike("username", username)
    .maybeSingle()

  if (error) throw new Error(`Lecture du compte impossible : ${error.message}`)
  return (data as AdminUser | null) ?? null
}
