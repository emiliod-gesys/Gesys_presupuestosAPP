import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"

export const dynamic = "force-dynamic"
import Link from "next/link"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { StatusBadge } from "@/components/ui/badge"
import { formatCurrency, getBudgetStatus, cn } from "@/lib/utils"
import { Network, ArrowLeft } from "lucide-react"

type ProjectRow = {
  id: string
  name: string
  status: string
  total_budget: number
  currency: string
}

export default async function ProjectFamilyComparePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: family, error } = await supabase
    .from("project_families")
    .select("id, name, created_at, projects(id, name, status, total_budget, currency)")
    .eq("id", id)
    .single()

  if (error || !family) notFound()

  const raw = family.projects as ProjectRow[] | ProjectRow | null | undefined
  const projects = Array.isArray(raw) ? raw : raw ? [raw] : []
  const ids = projects.map((p) => p.id)

  const spentByProject: Record<string, number> = {}
  if (ids.length > 0) {
    const { data: txs } = await supabase
      .from("transactions")
      .select("project_id, amount, transaction_type:transaction_types(type)")
      .in("project_id", ids)

    for (const tx of txs || []) {
      const type = (tx.transaction_type as unknown as { type: string } | null)?.type
      if (type === "expense") {
        spentByProject[tx.project_id] = (spentByProject[tx.project_id] || 0) + Number(tx.amount)
      }
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-in">
      <div>
        <Link
          href="/project-families"
          className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-indigo-600"
        >
          <ArrowLeft className="h-4 w-4" />
          Familias de proyectos
        </Link>
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900 sm:text-2xl">
          <Network className="h-7 w-7 text-teal-600" aria-hidden />
          {family.name}
        </h1>
        <p className="mt-1 text-sm text-gray-500">Comparación de presupuesto y gasto entre proyectos de la misma familia</p>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-gray-900">Resumen</h2>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Proyecto</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Presupuesto</th>
                <th className="px-4 py-3 text-right">Gastado</th>
                <th className="px-4 py-3 text-right">% ejecución</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {projects.map((p) => {
                const budget = Number(p.total_budget) || 0
                const spent = Math.max(0, spentByProject[p.id] || 0)
                const { pct, bg, color } = getBudgetStatus(spent, budget)
                return (
                  <tr key={p.id} className="hover:bg-gray-50/80">
                    <td className="px-4 py-3">
                      <Link href={`/projects/${p.id}`} className="font-medium text-indigo-700 hover:underline">
                        {p.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                      {formatCurrency(budget, p.currency || "GTQ")}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                      {formatCurrency(spent, p.currency || "GTQ")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={cn(
                          "inline-block min-w-[3rem] rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums",
                          bg,
                          color
                        )}
                      >
                        {pct.toFixed(0)}%
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {projects.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-gray-500">No hay proyectos vinculados a esta familia.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
