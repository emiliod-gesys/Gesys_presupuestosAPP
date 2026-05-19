/**
 * Compromisos: el cupo aún no ejecutado dentro de cada compromiso resta del presupuesto
 * disponible del renglón, sin contar dos veces los gastos ya imputados a ese compromiso.
 */

export type ReservationBudgetRow = {
  id: string
  category_id: string
  reserved_amount: number | string
}

/** PostgREST puede devolver el embed como objeto o como array de un elemento. */
type TxForReservation = {
  reservation_id?: string | null
  amount: number | string
  transaction_type?: { type: string } | { type: string }[] | null
}

function transactionTypeFromEmbed(embed: TxForReservation["transaction_type"]): string | undefined {
  if (embed == null) return undefined
  if (Array.isArray(embed)) {
    const first = embed[0]
    return first && typeof first === "object" && "type" in first ? String(first.type) : undefined
  }
  if (typeof embed === "object" && "type" in embed) return String((embed as { type: string }).type)
  return undefined
}

export function expenseSumByReservationIdFromTxRows(rows: TxForReservation[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const tx of rows) {
    const type = transactionTypeFromEmbed(tx.transaction_type)
    if (type !== "expense" || !tx.reservation_id) continue
    const rid = tx.reservation_id
    out[rid] = (out[rid] || 0) + (Number(tx.amount) || 0)
  }
  return out
}

/** Cupo de compromiso aún no cubierto por gastos ligados a ese compromiso, por categoría. */
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
