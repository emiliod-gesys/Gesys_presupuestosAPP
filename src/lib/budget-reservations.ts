/**
 * Reservas: el cupo aún no ejecutado dentro de cada reserva resta del presupuesto
 * disponible del renglón, sin contar dos veces los gastos ya imputados a esa reserva.
 */

export type ReservationBudgetRow = {
  id: string
  category_id: string
  reserved_amount: number | string
}

type TxForReservation = {
  reservation_id?: string | null
  amount: number | string
  transaction_type?: { type: string } | null
}

export function expenseSumByReservationIdFromTxRows(rows: TxForReservation[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const tx of rows) {
    const type = (tx.transaction_type as { type?: string } | null | undefined)?.type
    if (type !== "expense" || !tx.reservation_id) continue
    const rid = tx.reservation_id
    out[rid] = (out[rid] || 0) + (Number(tx.amount) || 0)
  }
  return out
}

/** Cupo de reserva aún no cubierto por gastos ligados a esa reserva, por categoría. */
export function pendingReservedByCategory(
  reservations: ReservationBudgetRow[],
  expenseByReservationId: Record<string, number>
): Record<string, number> {
  const byCat: Record<string, number> = {}
  for (const r of reservations) {
    const reserved = Math.max(0, Number(r.reserved_amount) || 0)
    const spentOn = Math.max(0, expenseByReservationId[r.id] || 0)
    const pending = Math.max(0, reserved - spentOn)
    if (pending <= 0) continue
    byCat[r.category_id] = (byCat[r.category_id] || 0) + pending
  }
  return byCat
}

export function totalPendingReserved(
  reservations: ReservationBudgetRow[],
  expenseByReservationId: Record<string, number>
): number {
  let sum = 0
  for (const r of reservations) {
    const reserved = Math.max(0, Number(r.reserved_amount) || 0)
    const spentOn = Math.max(0, expenseByReservationId[r.id] || 0)
    sum += Math.max(0, reserved - spentOn)
  }
  return sum
}
