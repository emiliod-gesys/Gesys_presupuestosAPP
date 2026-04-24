import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import { formatCurrency, formatDate, cn } from "@/lib/utils"
import { sumCategoryBudgets } from "@/lib/budget"
import { PrintToolbar } from "@/components/projects/print-toolbar"

export default async function BudgetStatementPrintPage({ params }: { params: Promise<{ id: string }> }) {
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

  if (!membership) redirect("/dashboard")

  const [{ data: project }, { data: categories }, { data: txData }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).single(),
    supabase.from("budget_categories").select("*").eq("project_id", id).order("order_index"),
    supabase
      .from("transactions")
      .select("category_id, amount, transaction_type:transaction_types(type)")
      .eq("project_id", id),
  ])

  if (!project) notFound()

  const spentByCategory: Record<string, number> = {}
  let totalSpent = 0
  ;(txData || []).forEach((tx) => {
    const type = (tx.transaction_type as unknown as { type: string } | null)?.type
    const delta = type === "expense" ? tx.amount : -tx.amount
    totalSpent += delta
    if (tx.category_id) spentByCategory[tx.category_id] = (spentByCategory[tx.category_id] || 0) + delta
  })

  const sumLines = sumCategoryBudgets(categories || [])
  const generated = new Date().toLocaleString("es-GT", { dateStyle: "long", timeStyle: "short" })
  const spentForSummary = Math.max(0, totalSpent)
  const totalAvailablePrint = Number(project.total_budget) - spentForSummary

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 print:max-w-none print:px-8 print:py-6">
      <PrintToolbar title="Estado de presupuesto" />

      <header className="mb-8 border-b border-gray-200 pb-6 print:mb-6">
        <p className="text-xs font-medium uppercase tracking-wide text-indigo-600">Gesys Presupuestos</p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900 print:text-3xl">{project.name}</h1>
        <div className="mt-3 grid gap-1 text-sm text-gray-600 sm:grid-cols-2">
          {project.client && <p><span className="font-medium text-gray-700">Cliente:</span> {project.client}</p>}
          {project.location && <p><span className="font-medium text-gray-700">Ubicación:</span> {project.location}</p>}
          {project.start_date && <p><span className="font-medium text-gray-700">Inicio:</span> {formatDate(project.start_date)}</p>}
          {project.end_date && <p><span className="font-medium text-gray-700">Fin:</span> {formatDate(project.end_date)}</p>}
          <p><span className="font-medium text-gray-700">Moneda:</span> {project.currency}</p>
          <p><span className="font-medium text-gray-700">Generado:</span> {generated}</p>
        </div>
      </header>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Resumen global</h2>
        <table className="w-full border-collapse text-sm">
          <tbody>
            <tr className="border-b border-gray-100">
              <td className="py-2 pr-4 text-gray-600">Presupuesto total del proyecto</td>
              <td className="py-2 text-right font-semibold">{formatCurrency(project.total_budget, project.currency)}</td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="py-2 pr-4 text-gray-600">Suma de renglones</td>
              <td className="py-2 text-right font-semibold">{formatCurrency(sumLines, project.currency)}</td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="py-2 pr-4 text-gray-600">Total ejecutado (gastos − ingresos netos)</td>
              <td className="py-2 text-right font-semibold">{formatCurrency(spentForSummary, project.currency)}</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 text-gray-600">Saldo disponible (presupuesto total − ejecutado)</td>
              <td
                className={cn(
                  "py-2 text-right font-semibold",
                  totalAvailablePrint < 0 ? "text-red-700" : "text-gray-900"
                )}
              >
                {formatCurrency(totalAvailablePrint, project.currency)}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Detalle por renglón</h2>
        <div className="overflow-x-auto rounded-lg border border-gray-200 print:border-gray-300">
          <table className="w-full min-w-[32rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left print:bg-gray-100">
                <th className="px-3 py-2 font-semibold text-gray-800">Renglón</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-800">Presupuesto</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-800">Ejecutado</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-800">Disponible</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-800">% uso</th>
              </tr>
            </thead>
            <tbody>
              {(categories || []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-gray-500">
                    Sin renglones definidos
                  </td>
                </tr>
              ) : (
                (categories || []).map((cat) => {
                  const spent = Math.max(0, spentByCategory[cat.id] || 0)
                  const budget = Number(cat.budget_amount) || 0
                  const avail = budget - spent
                  const pct = budget > 0 ? (spent / budget) * 100 : 0
                  return (
                    <tr key={cat.id} className="border-b border-gray-100 last:border-0">
                      <td className="px-3 py-2">
                        <p className="font-medium text-gray-900">{cat.name}</p>
                        {cat.description && <p className="text-xs text-gray-500">{cat.description}</p>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(budget, project.currency)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-red-700">{formatCurrency(spent, project.currency)}</td>
                      <td className={cn("px-3 py-2 text-right tabular-nums", avail < 0 ? "text-red-700" : "text-green-700")}>
                        {formatCurrency(avail, project.currency)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{pct.toFixed(1)}%</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="mt-10 border-t border-gray-100 pt-4 text-center text-xs text-gray-400 print:mt-8">
        Documento generado desde Gesys Presupuestos · Solo para uso interno o compartir con cliente según su política.
      </footer>
    </div>
  )
}
