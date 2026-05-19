import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatCurrency } from "@/lib/utils"
import { leafCategories } from "@/lib/budget-category-tree"
import { AddReservationButton } from "@/components/projects/add-reservation-button"
import { DeleteReservationButton } from "@/components/projects/delete-reservation-button"
import { AddTransactionButton } from "@/components/projects/add-transaction-button"
import type { UserRole } from "@/lib/types"

export const dynamic = "force-dynamic"

export default async function ReservationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const [{ data: membership }, { data: projectRow }, { data: categories }, { data: txTypes }, { data: reservations }] =
    await Promise.all([
      supabase.from("project_members").select("role").eq("project_id", id).eq("user_id", user.id).single(),
      supabase.from("projects").select("currency, status").eq("id", id).single(),
      supabase.from("budget_categories").select("id, name, parent_id").eq("project_id", id).order("order_index"),
      supabase.from("transaction_types").select("id, name, type"),
      supabase
        .from("project_reservations")
        .select("id, title, details, reserved_amount, category_id, created_at, created_by")
        .eq("project_id", id)
        .order("created_at", { ascending: false }),
    ])

  if (!membership) redirect("/dashboard")

  const role = membership.role as UserRole
  const canMutate = role === "admin" || role === "worker"
  const readOnly = projectRow?.status === "archived"
  const currency = projectRow?.currency || "GTQ"

  const catsRaw = categories || []
  const catById = new Map(catsRaw.map((c) => [c.id, c]))
  const leafCats = leafCategories(catsRaw as { id: string; parent_id?: string | null }[])
  const categoryOptions = leafCats.map((c) => {
    const row = c as { id: string; name: string; parent_id?: string | null }
    const parent = row.parent_id ? (catById.get(row.parent_id) as { name?: string } | undefined) : undefined
    return {
      value: row.id,
      label: parent?.name ? `${parent.name} — ${row.name}` : row.name,
    }
  })

  const reservationRows = reservations || []
  const reservationOptions = reservationRows.map((r) => ({ value: r.id as string, label: r.title as string }))

  const expenseTypeIds = (txTypes || []).filter((t) => t.type === "expense").map((t) => t.id)
  let txByReservation = new Map<string, number>()
  if (reservationRows.length > 0 && expenseTypeIds.length > 0) {
    const reservationIds = reservationRows.map((r) => r.id as string)
    const { data: txs } = await supabase
      .from("transactions")
      .select("reservation_id, amount, transaction_type_id")
      .eq("project_id", id)
      .in("reservation_id", reservationIds)
      .in("transaction_type_id", expenseTypeIds)

    for (const tx of txs || []) {
      if (!tx.reservation_id) continue
      const prev = txByReservation.get(tx.reservation_id) || 0
      txByReservation.set(tx.reservation_id, prev + (Number(tx.amount) || 0))
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Compromisos de presupuesto</h2>
              <p className="mt-1 text-xs text-gray-500">
                Compromete montos por renglón y asigna transacciones a cada compromiso para controlar su ejecución.
              </p>
            </div>
            {canMutate && (
              <AddReservationButton
                projectId={id}
                categoryOptions={categoryOptions}
                readOnly={readOnly}
              />
            )}
          </div>
        </CardHeader>
        <CardContent className="border-t border-gray-100 pt-4">
          {reservationRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              Aún no hay compromisos. Crea uno para apartar presupuesto por renglón.
            </p>
          ) : (
            <div className="space-y-3">
              {reservationRows.map((r) => {
                const spent = txByReservation.get(r.id as string) || 0
                const reserved = Number(r.reserved_amount) || 0
                const available = reserved - spent
                const catName = (catById.get(r.category_id as string) as { name?: string } | undefined)?.name || "—"
                return (
                  <div key={r.id as string} className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-gray-900">{r.title as string}</p>
                          <Badge variant="outline">{catName}</Badge>
                        </div>
                        {(r.details as string | null)?.trim() && (
                          <p className="mt-1 text-xs text-gray-600">{r.details as string}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {canMutate && (
                          <AddTransactionButton
                            buttonLabel="Agregar transacción"
                            projectId={id}
                            categories={categoryOptions}
                            txTypes={(txTypes || [])
                              .filter((t) => t.type === "expense")
                              .map((t) => ({ value: t.id, label: t.name, type: t.type }))}
                            reservationOptions={reservationOptions}
                            initialReservationId={r.id as string}
                            readOnly={readOnly}
                          />
                        )}
                        {canMutate && !readOnly && (
                          <DeleteReservationButton reservationId={r.id as string} title={r.title as string} />
                        )}
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
                      <div className="rounded-lg bg-gray-50 px-3 py-2">
                        <p className="text-gray-500">Comprometido</p>
                        <p className="font-semibold text-gray-900">{formatCurrency(reserved, currency)}</p>
                      </div>
                      <div className="rounded-lg bg-gray-50 px-3 py-2">
                        <p className="text-gray-500">Ejecutado</p>
                        <p className="font-semibold text-red-700">{formatCurrency(spent, currency)}</p>
                      </div>
                      <div className="rounded-lg bg-gray-50 px-3 py-2">
                        <p className="text-gray-500">Disponible</p>
                        <p className={`font-semibold ${available < 0 ? "text-red-700" : "text-green-700"}`}>
                          {formatCurrency(available, currency)}
                        </p>
                      </div>
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
