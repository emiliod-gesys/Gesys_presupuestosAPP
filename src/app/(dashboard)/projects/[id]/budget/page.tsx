import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { formatCurrency, getBudgetStatus, cn } from "@/lib/utils"
import { BudgetCommittedBar } from "@/components/projects/budget-committed-bar"
import {
  expenseSumByReservationIdFromTxRows,
  pendingReservedByCategory,
  totalPendingReserved as computeTotalPendingReserved,
} from "@/lib/budget-reservations"
import { budgetCategorySections } from "@/lib/budget-category-tree"
import { ManageCategoriesButton } from "@/components/projects/manage-categories-button"
import { BudgetAlignmentAlert } from "@/components/projects/budget-alignment-alert"
import { BudgetExportActions } from "@/components/projects/budget-export-actions"
import type { BudgetCategory, UserRole } from "@/lib/types"

function BudgetLineCard({
  cat,
  spentByCategory,
  pendingByCategory,
  currency,
}: {
  cat: BudgetCategory
  spentByCategory: Record<string, number>
  pendingByCategory: Record<string, number>
  currency: string
}) {
  const spent = Math.max(0, spentByCategory[cat.id] || 0)
  const pending = Math.max(0, pendingByCategory[cat.id] || 0)
  const committed = spent + pending
  const available = Number(cat.budget_amount) - spent - pending
  const { pct, color } = getBudgetStatus(committed, cat.budget_amount)
  return (
    <div className="space-y-2.5 rounded-xl border border-gray-100 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900">{cat.name}</p>
          {cat.description && <p className="mt-0.5 text-xs text-gray-500">{cat.description}</p>}
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-gray-900">{formatCurrency(cat.budget_amount, currency)}</p>
          <p className={`text-xs font-medium ${color}`}>{pct.toFixed(1)}% comprometido</p>
        </div>
      </div>
      <BudgetCommittedBar spent={spent} pending={pending} budget={Number(cat.budget_amount) || 0} heightClass="h-2.5" />
      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-gray-500">
        <span className="font-medium text-red-500">Gastado: {formatCurrency(spent, currency)}</span>
        <span className="font-medium text-indigo-800/90">Reservado pend.: {formatCurrency(pending, currency)}</span>
        <span className={cn("ml-auto font-medium", available < 0 ? "text-red-600" : "text-green-600")}>
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

  const [{ data: membership }, { data: project }, { data: categories }, { data: reservations }] = await Promise.all([
    supabase.from("project_members").select("role").eq("project_id", id).eq("user_id", user.id).single(),
    supabase.from("projects").select("total_budget, currency, name, status").eq("id", id).single(),
    supabase.from("budget_categories").select("*").eq("project_id", id).order("order_index"),
    supabase.from("project_reservations").select("id, category_id, reserved_amount").eq("project_id", id),
  ])

  if (!membership || !project) redirect("/dashboard")

  const { data: txData } = await supabase
    .from("transactions")
    .select("category_id, amount, reservation_id, transaction_type:transaction_types(type)")
    .eq("project_id", id)

  const spentByCategory: Record<string, number> = {}
  let totalSpent = 0
  ;(txData || []).forEach((tx) => {
    const type = (tx.transaction_type as unknown as { type: string } | null)?.type
    const delta = type === "expense" ? tx.amount : 0
    totalSpent += delta
    if (tx.category_id) spentByCategory[tx.category_id] = (spentByCategory[tx.category_id] || 0) + delta
  })

  const reservationRows = reservations || []
  const expenseByReservationId = expenseSumByReservationIdFromTxRows(txData || [])
  const pendingByCategory = pendingReservedByCategory(reservationRows, expenseByReservationId)
  const totalPendingReserved = computeTotalPendingReserved(reservationRows, expenseByReservationId)

  const role = membership.role as UserRole
  const readOnly = project.status === "archived"
  const spentForBar = Math.max(0, totalSpent)
  const committedTotal = spentForBar + totalPendingReserved
  const { pct: totalPct, color: totalColor } = getBudgetStatus(committedTotal, project.total_budget)
  const totalAvailable = Number(project.total_budget) - spentForBar - totalPendingReserved

  return (
    <div className="space-y-6">
      <BudgetAlignmentAlert
        projectId={id}
        projectTotalBudget={Number(project.total_budget) || 0}
        currency={project.currency}
        categories={categories || []}
        role={role}
        readOnly={readOnly}
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
                <ManageCategoriesButton projectId={id} categories={categories || []} readOnly={readOnly} />
              </div>
            )}
          </div>
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
            <span className="text-2xl font-bold text-gray-900 sm:text-3xl">
              {formatCurrency(project.total_budget, project.currency)}
            </span>
            <span className={`text-base font-semibold sm:text-lg ${totalColor}`}>
              {totalPct.toFixed(1)}% comprometido
            </span>
          </div>
          <BudgetCommittedBar
            spent={spentForBar}
            pending={totalPendingReserved}
            budget={Number(project.total_budget) || 0}
            heightClass="h-4"
          />
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-sm bg-emerald-500" aria-hidden />
              Ejecutado
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-sm bg-violet-600" aria-hidden />
              Reservado pendiente
            </span>
          </div>
          <div className="mt-3 flex flex-col gap-2 text-sm sm:flex-row sm:justify-between sm:gap-4">
            <div>
              <p className="text-xs text-gray-500">Gastado</p>
              <p className="font-semibold text-red-600">{formatCurrency(Math.max(0, totalSpent), project.currency)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Reservado pendiente</p>
              <p className="font-semibold text-indigo-800">{formatCurrency(Math.max(0, totalPendingReserved), project.currency)}</p>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-xs text-gray-500">Disponible</p>
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
                        pendingByCategory={pendingByCategory}
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
                  pendingByCategory={pendingByCategory}
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
