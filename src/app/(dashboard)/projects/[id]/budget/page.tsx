import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { formatCurrency, getBudgetStatus } from "@/lib/utils"
import { ManageCategoriesButton } from "@/components/projects/manage-categories-button"
import type { UserRole } from "@/lib/types"

export default async function BudgetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const [{ data: membership }, { data: project }, { data: categories }] = await Promise.all([
    supabase.from("project_members").select("role").eq("project_id", id).eq("user_id", user.id).single(),
    supabase.from("projects").select("total_budget, currency, name").eq("id", id).single(),
    supabase.from("budget_categories").select("*").eq("project_id", id).order("order_index"),
  ])

  if (!membership || !project) redirect("/dashboard")

  const { data: txData } = await supabase
    .from("transactions")
    .select("category_id, amount, transaction_type:transaction_types(type)")
    .eq("project_id", id)

  const spentByCategory: Record<string, number> = {}
  let totalSpent = 0
  ;(txData || []).forEach((tx) => {
    const type = (tx.transaction_type as unknown as { type: string } | null)?.type
    const delta = type === "expense" ? tx.amount : -tx.amount
    totalSpent += delta
    if (tx.category_id) spentByCategory[tx.category_id] = (spentByCategory[tx.category_id] || 0) + delta
  })

  const role = membership.role as UserRole
  const { pct: totalPct, bg: totalBg, color: totalColor } = getBudgetStatus(Math.max(0, totalSpent), project.total_budget)

  return (
    <div className="space-y-6">
      {/* Total budget card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Presupuesto total del proyecto</h2>
            {role === "admin" && <ManageCategoriesButton projectId={id} categories={categories || []} />}
          </div>
          <div className="flex justify-between items-baseline mb-3">
            <span className="text-3xl font-bold text-gray-900">
              {formatCurrency(project.total_budget, project.currency)}
            </span>
            <span className={`text-lg font-semibold ${totalColor}`}>
              {Math.min(totalPct, 100).toFixed(1)}% ejecutado
            </span>
          </div>
          <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${totalBg}`} style={{ width: `${Math.min(totalPct, 100)}%` }} />
          </div>
          <div className="flex justify-between mt-3 text-sm">
            <div>
              <p className="text-gray-500 text-xs">Gastado</p>
              <p className="font-semibold text-red-600">{formatCurrency(Math.max(0, totalSpent), project.currency)}</p>
            </div>
            <div className="text-right">
              <p className="text-gray-500 text-xs">Disponible</p>
              <p className="font-semibold text-green-600">{formatCurrency(Math.max(0, project.total_budget - Math.max(0, totalSpent)), project.currency)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Categories */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-gray-900">Renglones del presupuesto</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          {!(categories?.length) ? (
            <p className="text-gray-400 text-sm text-center py-8">No hay renglones definidos</p>
          ) : (
            categories.map((cat) => {
              const spent = Math.max(0, spentByCategory[cat.id] || 0)
              const available = Math.max(0, cat.budget_amount - spent)
              const { pct, bg, color } = getBudgetStatus(spent, cat.budget_amount)
              return (
                <div key={cat.id} className="p-4 border border-gray-100 rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{cat.name}</p>
                      {cat.description && <p className="text-xs text-gray-500 mt-0.5">{cat.description}</p>}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-900">{formatCurrency(cat.budget_amount, project.currency)}</p>
                      <p className={`text-xs font-medium ${color}`}>{Math.min(pct, 100).toFixed(1)}%</p>
                    </div>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${bg}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span className="text-red-500 font-medium">Gastado: {formatCurrency(spent, project.currency)}</span>
                    <span className="text-green-600 font-medium">Disponible: {formatCurrency(available, project.currency)}</span>
                  </div>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>
    </div>
  )
}
