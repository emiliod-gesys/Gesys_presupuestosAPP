import { formatCurrency } from "@/lib/utils"
import { isBudgetAligned, sumCategoryBudgets } from "@/lib/budget"
import { SyncProjectBudgetButton } from "@/components/projects/sync-project-budget-button"
import type { UserRole } from "@/lib/types"

interface Cat {
  id: string
  budget_amount: number | string
}

export function BudgetAlignmentAlert({
  projectId,
  projectTotalBudget,
  currency,
  categories,
  role,
}: {
  projectId: string
  projectTotalBudget: number
  currency: string
  categories: Cat[] | null
  role: UserRole
}) {
  const sumLines = sumCategoryBudgets(categories)
  if (isBudgetAligned(projectTotalBudget, categories)) return null

  const delta = Math.round((projectTotalBudget - sumLines) * 100) / 100
  const higher = delta > 0

  return (
    <div
      role="status"
      className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
    >
      <p className="font-medium">Diferencia entre presupuesto total y renglones</p>
      <p className="mt-1 text-amber-900/90">
        El total del proyecto es <strong>{formatCurrency(projectTotalBudget, currency)}</strong> y la suma de
        renglones es <strong>{formatCurrency(sumLines, currency)}</strong>
        {higher ? " (sobran " : " (faltan "}
        <strong>{formatCurrency(Math.abs(delta), currency)}</strong> respecto a los renglones).
      </p>
      <p className="mt-2 text-xs text-amber-900/80">
        Conviene alinear cifras para informes y control. Puedes ajustar renglones en &quot;Gestionar categorías&quot; o
        igualar el total del proyecto a la suma de renglones.
      </p>
      {role === "admin" && (
        <div className="mt-3">
          <SyncProjectBudgetButton projectId={projectId} sumFromCategories={sumLines} />
        </div>
      )}
    </div>
  )
}
