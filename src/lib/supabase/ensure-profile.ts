import type { SupabaseClient, User } from "@supabase/supabase-js"
import type { Profile } from "@/lib/types"

/**
 * Garantiza que exista la fila en `public.profiles` para el usuario autenticado.
 * Evita 500 en el layout si el trigger `handle_new_user` no corrió (p. ej. usuarios importados o BD sin trigger).
 */
export async function ensureProfileRow(
  supabase: SupabaseClient,
  user: User
): Promise<{ profile: Profile } | { error: string }> {
  const { data: existing } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle()

  if (existing) return { profile: existing as Profile }

  const email = user.email
  if (!email) return { error: "missing_email" }

  const meta = user.user_metadata || {}
  const { data: inserted, error } = await supabase
    .from("profiles")
    .insert({
      id: user.id,
      email,
      full_name: (meta.full_name as string | undefined) ?? (meta.name as string | undefined) ?? null,
      avatar_url: (meta.avatar_url as string | undefined) ?? null,
    })
    .select("*")
    .single()

  if (error || !inserted) return { error: error?.message || "insert_failed" }
  return { profile: inserted as Profile }
}
