import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { ensureProfileRow } from "@/lib/supabase/ensure-profile"
import { DashboardShell } from "@/components/dashboard/dashboard-shell"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const ensured = await ensureProfileRow(supabase, user)
  if ("error" in ensured) {
    redirect("/login?reason=profile")
  }
  const profile = ensured.profile

  const { count: unreadCount } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_read", false)

  return (
    <DashboardShell profile={profile} unreadCount={unreadCount ?? 0}>
      {children}
    </DashboardShell>
  )
}
