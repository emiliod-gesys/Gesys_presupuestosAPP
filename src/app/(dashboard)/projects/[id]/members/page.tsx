import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { RoleBadge } from "@/components/ui/badge"
import { Avatar } from "@/components/ui/avatar"
import { formatDateTime } from "@/lib/utils"
import { InviteMemberButton } from "@/components/projects/invite-member-button"
import { RemoveMemberButton } from "@/components/projects/remove-member-button"
import type { UserRole } from "@/lib/types"

export default async function MembersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const [{ data: membership }, { data: members }, { data: pendingInvitations }] = await Promise.all([
    supabase.from("project_members").select("role").eq("project_id", id).eq("user_id", user.id).single(),
    supabase
      .from("project_members")
      .select("*, user:profiles(full_name, email, avatar_url)")
      .eq("project_id", id)
      .order("joined_at"),
    supabase
      .from("project_invitations")
      .select("*, invitee:profiles!invitee_id(full_name, email, avatar_url)")
      .eq("project_id", id)
      .eq("status", "pending"),
  ])

  if (!membership) redirect("/dashboard")
  const isAdmin = membership.role === "admin"

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">
              Miembros del proyecto ({members?.length || 0})
            </h2>
            {isAdmin && <InviteMemberButton projectId={id} />}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-gray-50">
            {(members || []).map((m) => {
              const u = m.user as { full_name?: string; email: string; avatar_url?: string } | null
              const isSelf = m.user_id === user.id
              return (
                <div key={m.id} className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors">
                  <Avatar src={u?.avatar_url} name={u?.full_name || u?.email} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900">{u?.full_name || "Sin nombre"}</p>
                      {isSelf && <span className="text-xs text-indigo-500 font-medium">(tú)</span>}
                    </div>
                    <p className="text-xs text-gray-500">{u?.email}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Miembro desde {formatDateTime(m.joined_at)}</p>
                  </div>
                  <RoleBadge role={m.role as UserRole} />
                  {isAdmin && !isSelf && (
                    <RemoveMemberButton memberId={m.id} projectId={id} userName={u?.full_name || u?.email || "este miembro"} />
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Pending invitations */}
      {isAdmin && !!pendingInvitations?.length && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-gray-900">
              Invitaciones pendientes ({pendingInvitations.length})
            </h2>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-50">
              {pendingInvitations.map((inv) => {
                const invitee = inv.invitee as { full_name?: string; email: string; avatar_url?: string } | null
                return (
                  <div key={inv.id} className="flex items-center gap-4 px-6 py-4">
                    <Avatar src={invitee?.avatar_url} name={invitee?.full_name || invitee?.email} size="md" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{invitee?.full_name || invitee?.email}</p>
                      <p className="text-xs text-gray-500">{invitee?.email}</p>
                    </div>
                    <RoleBadge role={inv.role as UserRole} />
                    <span className="text-xs text-yellow-600 bg-yellow-50 px-2 py-1 rounded-full">Pendiente</span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
