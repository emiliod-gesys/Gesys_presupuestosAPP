import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { formatCurrency, getBudgetStatus, budgetBarWidthPct, cn } from "@/lib/utils"
import { budgetCategorySections } from "@/lib/budget-category-tree"
import { ManageCategoriesButton } from "@/components/projects/manage-categories-button"
import { BudgetAlignmentAlert } from "@/components/projects/budget-alignment-alert"
import { BudgetExportActions } from "@/components/projects/budget-export-actions"
import type { BudgetCategory, UserRole } from "@/lib/types"

function BudgetLineCard({
  cat,
  spentByCategory,
  currency,
}: {
  cat: BudgetCategory
  spentByCategory: Record<string, number>
  currency: string
}) {
  const spent = Math.max(0, spentByCategory[cat.id] || 0)
  const available = Number(cat.budget_amount) - spent
  const { pct, bg, color } = getBudgetStatus(spent, cat.budget_amount)
  return (
    <div className="space-y-2.5 rounded-xl border border-gray-100 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900">{cat.name}</p>
          {cat.description && <p className="mt-0.5 text-xs text-gray-500">{cat.description}</p>}
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-gray-900">{formatCurrency(cat.budget_amount, currency)}</p>
          <p className={`text-xs font-medium ${color}`}>{pct.toFixed(1)}%</p>
        </div>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full rounded-full ${bg}`} style={{ width: `${budgetBarWidthPct(pct)}%` }} />
      </div>
      <div className="flex justify-between text-xs text-gray-500">
        <span className="font-medium text-red-500">Gastado: {formatCurrency(spent, currency)}</span>
        <span className={cn("font-medium", available < 0 ? "text-red-600" : "text-green-600")}>
          Disponible: {formatCurrency(available, currency)}
        </span>
      </div>
    </div>
  )
}

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
  const spentForBar = Math.max(0, totalSpent)
  const { pct: totalPct, bg: totalBg, color: totalColor } = getBudgetStatus(spentForBar, project.total_budget)
  const totalAvailable = Number(project.total_budget) - spentForBar

  return (
    <div className="space-y-6">
      <BudgetAlignmentAlert
        projectId={id}
        projectTotalBudget={Number(project.total_budget) || 0}
        currency={project.currency}
        categories={categories || []}
        role={role}
      />

      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Informes</h2>
              <p className="mt-0.5 text-xs text-gray-500">
                Imprime o exporta el estado del presupuesto para compartir con el cliente o archivo interno.
              </p>
            </div>
            <BudgetExportActions projectId={id} />
          </div>
        </CardContent>
      </Card>

      {/* Total budget card */}
      <Card>
        <CardContent className="pt-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Presupuesto total del proyecto</h2>
            {role === "admin" && (
              <div className="w-full sm:w-auto">
                <ManageCategoriesButton projectId={id} categories={categories || []} />
              </div>
            )}
          </div>
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
            <span className="text-2xl font-bold text-gray-900 sm:text-3xl">
              {formatCurrency(project.total_budget, project.currency)}
            </span>
            <span className={`text-base font-semibold sm:text-lg ${totalColor}`}>
              {totalPct.toFixed(1)}% ejecutado
            </span>
          </div>
          <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${totalBg}`} style={{ width: `${budgetBarWidthPct(totalPct)}%` }} />
          </div>
          <div className="flex justify-between mt-3 text-sm">
            <div>
              <p className="text-gray-500 text-xs">Gastado</p>
              <p className="font-semibold text-red-600">{formatCurrency(Math.max(0, totalSpent), project.currency)}</p>
            </div>
            <div className="text-right">
              <p className="text-gray-500 text-xs">Disponible</p>
              <p className={cn("font-semibold", totalAvailable < 0 ? "text-red-600" : "text-green-600")}>
                {formatCurrency(totalAvailable, project.currency)}
              </p>
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
            budgetCategorySections(categories || []).map(({ header, children }) =>
              children.length > 0 ? (
                <div key={header.id} className="space-y-3">
                  <div className="rounded-lg border border-indigo-100 bg-indigo-50/70 px-3 py-2">
                    <p className="text-sm font-semibold text-indigo-950">{header.name}</p>
                    {header.description ? (
                      <p className="mt-0.5 text-xs text-indigo-900/80">{header.description}</p>
                    ) : null}
                  </div>
                  <div className="space-y-4 sm:pl-1">
                    {children.map((cat) => (
                      <BudgetLineCard
                        key={cat.id}
                        cat={cat}
                        spentByCategory={spentByCategory}
                        currency={project.currency}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <BudgetLineCard
                  key={header.id}
                  cat={header}
                  spentByCategory={spentByCategory}
                  currency={project.currency}
                />
              )
            )
          )}
        </CardContent>
      </Card>
    </div>
  )
}
