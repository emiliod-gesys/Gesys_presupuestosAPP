import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Plus, Bell, FolderOpen, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge, StatusBadge, RoleBadge } from "@/components/ui/badge"
import { Avatar } from "@/components/ui/avatar"
import { formatCurrency, formatDate, getBudgetStatus, budgetBarWidthPct } from "@/lib/utils"
import { NotificationActions } from "@/components/dashboard/notification-actions"
import { InvitationActions } from "@/components/dashboard/invitation-actions"

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  // Projects where user is a member
  const { data: rawMemberships } = await supabase
    .from("project_members")
    .select("role, project:projects(*)")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: false })

  /** Sin fila de proyecto (p. ej. RLS) rompería el render al acceder a project.id */
  const memberships = (rawMemberships ?? []).filter(
    (m) => m.project != null && typeof m.project === "object" && "id" in m.project
  )

  // Pending project invitations
  const { data: rawInvitations } = await supabase
    .from("project_invitations")
    .select("*, project:projects(name, client), inviter:profiles!inviter_id(full_name, email, avatar_url)")
    .eq("invitee_id", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })

  const invitations = (rawInvitations ?? []).filter(
    (inv) =>
      inv.project != null &&
      typeof inv.project === "object" &&
      "name" in inv.project &&
      inv.inviter != null
  )

  // Unread notifications
  const { data: notifications } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_read", false)
    .order("created_at", { ascending: false })
    .limit(10)

  // Get spent amounts per project
  const projectIds = (memberships || []).map((m) => (m.project as unknown as { id: string }).id)
  let spentByProject: Record<string, number> = {}

  if (projectIds.length > 0) {
    const { data: txData } = await supabase
      .from("transactions")
      .select("project_id, amount, transaction_type:transaction_types(type)")
      .in("project_id", projectIds)

    if (txData) {
      txData.forEach((tx) => {
        const type = (tx.transaction_type as unknown as { type: string } | null)?.type
        const delta = type === "expense" ? tx.amount : -tx.amount
        spentByProject[tx.project_id] = (spentByProject[tx.project_id] || 0) + delta
      })
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 animate-in sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Dashboard</h1>
          <p className="mt-0.5 text-sm text-gray-500">Gestiona tus proyectos y presupuestos</p>
        </div>
        <Link href="/projects/new" className="w-full shrink-0 sm:w-auto">
          <Button className="w-full sm:w-auto">
            <Plus className="h-4 w-4" />
            Nuevo proyecto
          </Button>
        </Link>
      </div>

      {memberships && memberships.length > 0 ? (() => {
        let totalBudgetSum = 0
        let totalSpentSum = 0
        let atRiskCount = 0
        const currencies = new Set<string>()
        for (const m of memberships) {
          const p = m.project as unknown as { id: string; total_budget: number; currency: string }
          const b = Number(p.total_budget) || 0
          totalBudgetSum += b
          const spent = Math.max(0, spentByProject[p.id] || 0)
          totalSpentSum += spent
          currencies.add(p.currency || "GTQ")
          const pct = b > 0 ? (spent / b) * 100 : 0
          if (pct >= 75) atRiskCount++
        }
        const mixedCurrency = currencies.size > 1
        const globalPct = totalBudgetSum > 0 ? (totalSpentSum / totalBudgetSum) * 100 : 0
        return (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="py-4">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Resumen</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{memberships.length}</p>
                <p className="text-xs text-gray-500">proyectos en tu cuenta</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Ejecución global</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{globalPct.toFixed(0)}%</p>
                <p className="text-xs text-gray-500">
                  {mixedCurrency
                    ? "Suma de montos (varias monedas mezcladas; referencia aproximada)."
                    : "Sobre la suma de presupuestos de proyecto."}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Seguimiento</p>
                <p className="mt-1 text-2xl font-bold text-amber-700">{atRiskCount}</p>
                <p className="text-xs text-gray-500">proyectos con ejecución ≥ 75%</p>
              </CardContent>
            </Card>
          </div>
        )
      })() : null}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Projects grid - 2/3 width */}
        <div className="xl:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Mis proyectos</h2>
            <span className="text-sm text-gray-500">{memberships?.length || 0} proyectos</span>
          </div>

          {!memberships?.length ? (
            <Card>
              <CardContent className="py-16 text-center">
                <FolderOpen className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">No tienes proyectos aún</p>
                <p className="text-gray-400 text-sm mt-1">Crea tu primer proyecto para comenzar</p>
                <Link href="/projects/new">
                  <Button className="mt-4" size="sm">
                    <Plus className="h-4 w-4" /> Crear proyecto
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {memberships.map((m) => {
                const project = m.project as unknown as {
                  id: string; name: string; client?: string; status: string;
                  total_budget: number; currency: string; start_date?: string; end_date?: string
                }
                const spent = Math.max(0, spentByProject[project.id] || 0)
                const { pct, bg } = getBudgetStatus(spent, project.total_budget)

                return (
                  <Link key={project.id} href={`/projects/${project.id}`}>
                    <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                      <CardContent className="pt-5">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-gray-900 truncate">{project.name}</h3>
                            {project.client && (
                              <p className="text-xs text-gray-500 mt-0.5 truncate">{project.client}</p>
                            )}
                          </div>
                          <div className="flex gap-1.5 ml-2 flex-shrink-0">
                            <StatusBadge status={project.status} />
                            <RoleBadge role={m.role} />
                          </div>
                        </div>

                        {/* Budget bar */}
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-xs text-gray-500">
                            <span>Presupuesto ejecutado</span>
                            <span className="font-medium">{pct.toFixed(1)}%</span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${bg}`}
                              style={{ width: `${budgetBarWidthPct(pct)}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-500">{formatCurrency(spent, project.currency)} gastado</span>
                            <span className="font-medium text-gray-700">{formatCurrency(project.total_budget, project.currency)}</span>
                          </div>
                        </div>

                        {(project.start_date || project.end_date) && (
                          <div className="mt-3 pt-3 border-t border-gray-50 flex gap-4 text-xs text-gray-400">
                            {project.start_date && <span>Inicio: {formatDate(project.start_date)}</span>}
                            {project.end_date && <span>Fin: {formatDate(project.end_date)}</span>}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Right column: notifications + invitations */}
        <div className="space-y-6">
          {/* Invitations */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-indigo-600" />
                <h2 className="text-sm font-semibold text-gray-900">Invitaciones pendientes</h2>
                {!!invitations?.length && (
                  <Badge variant="info">{invitations.length}</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="py-3">
              {!invitations?.length ? (
                <p className="text-sm text-gray-400 py-4 text-center">Sin invitaciones pendientes</p>
              ) : (
                <div className="space-y-3">
                  {invitations.map((inv) => (
                    <div key={inv.id} className="border border-gray-100 rounded-lg p-3">
                      <p className="text-sm font-medium text-gray-900 mb-0.5">
                        {(inv.project as { name: string }).name}
                      </p>
                      <p className="text-xs text-gray-500 mb-2">
                        De: {(inv.inviter as { full_name?: string; email: string }).full_name || (inv.inviter as { email: string }).email}
                        {" · "}<RoleBadge role={inv.role} />
                      </p>
                      <InvitationActions invitationId={inv.id} projectId={(inv.project as { id?: string })?.id || ""} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Notifications */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-indigo-600" />
                <h2 className="text-sm font-semibold text-gray-900">Notificaciones</h2>
                {!!notifications?.length && (
                  <Badge variant="danger">{notifications.length}</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="py-3">
              {!notifications?.length ? (
                <p className="text-sm text-gray-400 py-4 text-center">Sin notificaciones nuevas</p>
              ) : (
                <div className="space-y-2">
                  {notifications.map((n) => (
                    <NotificationActions key={n.id} notification={n} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
