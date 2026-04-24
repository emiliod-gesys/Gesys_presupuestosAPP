import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { StatusBadge } from "@/components/ui/badge"
import { Avatar } from "@/components/ui/avatar"
import { formatCurrency, formatDate, getBudgetStatus } from "@/lib/utils"
import { MapPin, Calendar, Users, Building2 } from "lucide-react"
import { ProjectStatusActions } from "@/components/projects/project-status-actions"
import { DuplicateProjectButton } from "@/components/projects/duplicate-project-button"
import { EditProjectInfoButton } from "@/components/projects/edit-project-info-button"
import { DeleteProjectButton } from "@/components/projects/delete-project-button"

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const [{ data: project }, { data: membership }, { data: members }, { data: categories }] = await Promise.all([
    supabase.from("projects").select("*, creator:profiles!created_by(full_name, email, avatar_url)").eq("id", id).single(),
    supabase.from("project_members").select("role").eq("project_id", id).eq("user_id", user.id).single(),
    supabase.from("project_members").select("role, user:profiles(full_name, email, avatar_url)").eq("project_id", id),
    supabase.from("budget_categories").select("id, name, budget_amount").eq("project_id", id).order("order_index"),
  ])

  if (!project || !membership) redirect("/dashboard")

  // Get spending per category
  const { data: txData } = await supabase
    .from("transactions")
    .select("category_id, amount, transaction_type:transaction_types(type)")
    .eq("project_id", id)

  const spentByCategory: Record<string, number> = {}
  const totalSpent = (txData || []).reduce((sum, tx) => {
    const type = (tx.transaction_type as unknown as { type: string } | null)?.type
    const delta = type === "expense" ? tx.amount : -tx.amount
    if (tx.category_id) spentByCategory[tx.category_id] = (spentByCategory[tx.category_id] || 0) + delta
    return sum + delta
  }, 0)

  const { pct: totalPct, bg: totalBg } = getBudgetStatus(Math.max(0, totalSpent), project.total_budget)

  const editInfoInitial = {
    name: project.name ?? "",
    client: project.client ?? "",
    location: project.location ?? "",
    start_date: project.start_date ? String(project.start_date) : "",
    end_date: project.end_date ? String(project.end_date) : "",
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      {/* Main info */}
      <div className="xl:col-span-2 space-y-4">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <StatusBadge status={project.status} />
                {project.is_template && (
                  <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                    Plantilla
                  </span>
                )}
              </div>
              {membership.role === "admin" && (
                <div className="flex w-full flex-col gap-2 sm:ml-auto sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                  <EditProjectInfoButton projectId={id} initial={editInfoInitial} />
                  <DuplicateProjectButton projectId={id} />
                  <ProjectStatusActions projectId={id} currentStatus={project.status} />
                  <DeleteProjectButton projectId={id} projectName={project.name} />
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {project.description && (
              <p className="text-gray-600 text-sm mb-4 leading-relaxed">{project.description}</p>
            )}
            <div className="grid grid-cols-2 gap-4 text-sm">
              {project.client && (
                <div className="flex items-center gap-2 text-gray-600">
                  <Building2 className="h-4 w-4 text-gray-400" />
                  <span>{project.client}</span>
                </div>
              )}
              {project.location && (
                <div className="flex items-center gap-2 text-gray-600">
                  <MapPin className="h-4 w-4 text-gray-400" />
                  <span>{project.location}</span>
                </div>
              )}
              {project.start_date && (
                <div className="flex items-center gap-2 text-gray-600">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  <span>Inicio: {formatDate(project.start_date)}</span>
                </div>
              )}
              {project.end_date && (
                <div className="flex items-center gap-2 text-gray-600">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  <span>Fin: {formatDate(project.end_date)}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Budget overview */}
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-gray-900">Resumen de presupuesto</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Total */}
            <div className="p-4 bg-gray-50 rounded-xl">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-500">Total ejecutado</span>
                <span className="font-semibold">{Math.min(totalPct, 100).toFixed(1)}%</span>
              </div>
              <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${totalBg}`} style={{ width: `${Math.min(totalPct, 100)}%` }} />
              </div>
              <div className="flex justify-between mt-2 text-sm">
                <span className="text-gray-600">{formatCurrency(Math.max(0, totalSpent), project.currency)} gastado</span>
                <span className="font-bold text-gray-900">{formatCurrency(project.total_budget, project.currency)} total</span>
              </div>
            </div>

            {/* By category */}
            {(categories || []).map((cat) => {
              const spent = Math.max(0, spentByCategory[cat.id] || 0)
              const { pct, bg } = getBudgetStatus(spent, cat.budget_amount)
              return (
                <div key={cat.id}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-700 font-medium">{cat.name}</span>
                    <span className="text-gray-500">
                      {formatCurrency(spent, project.currency)} / {formatCurrency(cat.budget_amount, project.currency)}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${bg}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>

      {/* Right column */}
      <div className="space-y-4">
        {/* Members */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-indigo-600" />
              <h2 className="text-sm font-semibold text-gray-900">
                Miembros ({members?.length || 0})
              </h2>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-2">
            {(members || []).map((m) => {
              const u = m.user as unknown as { full_name?: string; email: string; avatar_url?: string } | null
              return (
                <div key={`${m.role}-${u?.email}`} className="flex items-center gap-3">
                  <Avatar src={u?.avatar_url} name={u?.full_name || u?.email} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{u?.full_name || u?.email}</p>
                    <p className="text-xs text-gray-500 truncate">{u?.email}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    m.role === "admin" ? "bg-blue-100 text-blue-700" :
                    m.role === "worker" ? "bg-green-100 text-green-700" :
                    "bg-gray-100 text-gray-600"
                  }`}>
                    {m.role === "admin" ? "Admin" : m.role === "worker" ? "Trabajador" : "Observador"}
                  </span>
                </div>
              )
            })}
          </CardContent>
        </Card>

        {/* Stats */}
        <Card>
          <CardContent className="pt-5 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Presupuesto total</span>
              <span className="font-semibold text-gray-900">{formatCurrency(project.total_budget, project.currency)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Total gastado</span>
              <span className="font-semibold text-red-600">{formatCurrency(Math.max(0, totalSpent), project.currency)}</span>
            </div>
            <div className="flex justify-between text-sm border-t pt-3">
              <span className="text-gray-500">Disponible</span>
              <span className="font-bold text-green-600">
                {formatCurrency(Math.max(0, project.total_budget - Math.max(0, totalSpent)), project.currency)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
