import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Avatar } from "@/components/ui/avatar"
import { formatDateTime } from "@/lib/utils"
import { Shield } from "lucide-react"

const actionLabels: Record<string, string> = {
  project_created: "Creó el proyecto",
  status_changed: "Cambió el estado del proyecto",
  member_invited: "Invitó a un miembro",
  member_joined: "Se unió al proyecto",
  member_removed: "Removió a un miembro",
  transaction_created: "Registró una transacción",
  transaction_updated: "Actualizó una transacción",
  transaction_deleted: "Eliminó una transacción",
  category_created: "Creó un renglón",
  category_updated: "Actualizó un renglón",
  category_deleted: "Eliminó un renglón",
  alert_created: "Configuró una alerta de presupuesto",
}

export default async function LogsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: membership } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", id)
    .eq("user_id", user.id)
    .single()

  if (!membership || membership.role !== "admin") redirect(`/projects/${id}`)

  const { data: logs } = await supabase
    .from("project_logs")
    .select("*, user:profiles(full_name, email, avatar_url)")
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .limit(200)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-indigo-600" />
            <h2 className="text-sm font-semibold text-gray-900">
              Historial de actividad ({logs?.length || 0} registros)
            </h2>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Registro inmutable de todas las acciones realizadas en este proyecto.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {!logs?.length ? (
            <div className="py-12 text-center text-gray-400">
              <p>Sin actividad registrada aún</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {logs.map((log) => {
                const u = log.user as { full_name?: string; email: string; avatar_url?: string } | null
                const label = actionLabels[log.action] || log.action
                return (
                  <div key={log.id} className="flex items-start gap-4 px-6 py-4 hover:bg-gray-50 transition-colors">
                    <Avatar src={u?.avatar_url} name={u?.full_name || u?.email} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-900">
                          {u?.full_name || u?.email}
                        </span>
                        <span className="text-sm text-gray-600">{label}</span>
                      </div>
                      {log.details && Object.keys(log.details).length > 0 && (
                        <div className="mt-1 text-xs text-gray-400 bg-gray-50 rounded px-2 py-1 font-mono">
                          {JSON.stringify(log.details, null, 0).replace(/[{}"]/g, "").replace(/,/g, " · ")}
                        </div>
                      )}
                      <p className="text-xs text-gray-400 mt-1">{formatDateTime(log.created_at)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
