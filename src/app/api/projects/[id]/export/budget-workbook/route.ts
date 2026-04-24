import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { NextResponse } from "next/server"
import * as XLSX from "xlsx"
import { sumCategoryBudgets } from "@/lib/budget"
import { budgetCategorySections } from "@/lib/budget-category-tree"
import type { BudgetCategory } from "@/lib/types"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse("No autorizado", { status: 401 })

  const { data: membership } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", id)
    .eq("user_id", user.id)
    .single()

  if (!membership) return new NextResponse("Prohibido", { status: 403 })

  const [{ data: project }, { data: categories }, { data: txData }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).single(),
    supabase.from("budget_categories").select("*").eq("project_id", id).order("order_index"),
    supabase
      .from("transactions")
      .select("category_id, amount, transaction_type:transaction_types(type)")
      .eq("project_id", id),
  ])

  if (!project) return new NextResponse("No encontrado", { status: 404 })

  const spentByCategory: Record<string, number> = {}
  let totalSpent = 0
  ;(txData || []).forEach((tx) => {
    const type = (tx.transaction_type as unknown as { type: string } | null)?.type
    const delta = type === "expense" ? tx.amount : 0
    totalSpent += delta
    if (tx.category_id) spentByCategory[tx.category_id] = (spentByCategory[tx.category_id] || 0) + delta
  })

  const sumLines = sumCategoryBudgets(categories || [])

  const resumen = [
    ["Concepto", "Monto"],
    ["Presupuesto total del proyecto", project.total_budget],
    ["Suma de renglones", sumLines],
    ["Total ejecutado", Math.max(0, totalSpent)],
    ["Saldo disponible (total − ejecutado)", Number(project.total_budget) - Math.max(0, totalSpent)],
    ["Moneda", project.currency],
  ]

  const renglonesRows = budgetCategorySections((categories || []) as BudgetCategory[]).flatMap(({ header, children }) => {
    const row = (displayName: string, cat: BudgetCategory) => {
      const spent = Math.max(0, spentByCategory[cat.id] || 0)
      const budget = Number(cat.budget_amount) || 0
      const avail = budget - spent
      const pct = budget > 0 ? ((spent / budget) * 100).toFixed(1) : "0"
      return [displayName, cat.description || "", budget, spent, avail, pct]
    }
    if (children.length > 0) {
      return children.map((cat) => row(`${header.name} › ${cat.name}`, cat))
    }
    return [row(header.name, header)]
  })

  const renglones = [["Renglón", "Descripción", "Presupuesto", "Ejecutado", "Disponible", "% uso"], ...renglonesRows]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumen), "Resumen")
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(renglones), "Renglones")

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer
  const body = new Uint8Array(buffer)

  const safeName = String(project.name).replace(/[^\w\s-]/g, "").slice(0, 40) || "proyecto"

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="estado-presupuesto-${safeName}.xlsx"`,
    },
  })
}
