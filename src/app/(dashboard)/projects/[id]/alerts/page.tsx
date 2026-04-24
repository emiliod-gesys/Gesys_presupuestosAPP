import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { formatCurrency } from "@/lib/utils"
import { leafCategories } from "@/lib/budget-category-tree"
import { CreateAlertButton } from "@/components/projects/create-alert-button"
import { DeleteAlertButton } from "@/components/projects/delete-alert-button"
import { Bell, BellOff } from "lucide-react"

export default async function AlertsPage({ params }: { params: Promise<{ id: string }> }) {
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

  const [{ data: alerts }, { data: categories }, { data: project }] = await Promise.all([
    supabase
      .from("budget_alerts")
      .select("*, category:budget_categories(name, budget_amount)")
      .eq("project_id", id)
      .order("threshold_percentage"),
    supabase.from("budget_categories").select("id, name, budget_amount, parent_id").eq("project_id", id).order("order_index"),
    supabase.from("projects").select("currency, status").eq("id", id).single(),
  ])

  const readOnly = project?.status === "archived"
  const cats = categories || []
  const alertCategoryOptions = leafCategories(cats as { id: string; parent_id?: string | null }[]).map((c) => {
    const row = c as { id: string; name: string; parent_id?: string | null }
    const parent = row.parent_id ? cats.find((x) => x.id === row.parent_id) : undefined
    const label = parent?.name ? `${parent.name} — ${row.name}` : row.name
    return { value: row.id, label }
  })

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-indigo-600" />
              <h2 className="text-sm font-semibold text-gray-900">
                Alertas de presupuesto ({alerts?.length || 0})
              </h2>
            </div>
            {!readOnly && <CreateAlertButton projectId={id} categories={alertCategoryOptions} />}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Recibe notificaciones automáticas cuando un renglón alcance el porcentaje configurado.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {!alerts?.length ? (
            <div className="py-12 text-center text-gray-400">
              <BellOff className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p className="font-medium">Sin alertas configuradas</p>
              <p className="text-sm mt-1">Crea alertas para monitorear el presupuesto</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {alerts.map((alert) => {
                const cat = alert.category as { name: string; budget_amount: number } | null
                const alertAmount = cat ? (cat.budget_amount * alert.threshold_percentage) / 100 : 0
                return (
                  <div key={alert.id} className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                      alert.threshold_percentage >= 100 ? "bg-red-100 text-red-700" :
                      alert.threshold_percentage >= 75 ? "bg-orange-100 text-orange-700" :
                      "bg-yellow-100 text-yellow-700"
                    }`}>
                      {alert.threshold_percentage}%
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{cat?.name || "Renglón eliminado"}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Se activa al alcanzar {alert.threshold_percentage}% del presupuesto
                        {cat && ` · ${formatCurrency(alertAmount, project?.currency)}`}
                      </p>
                    </div>
                    <div className={`text-xs px-2 py-1 rounded-full font-medium ${
                      alert.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                    }`}>
                      {alert.is_active ? "Activa" : "Inactiva"}
                    </div>
                    {!readOnly && <DeleteAlertButton alertId={alert.id} />}
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
