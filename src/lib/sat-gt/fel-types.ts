/** Emitidos (E) → ingreso; recibidos (R) → gasto. */
export type SatDteFlow = "income" | "expense"

export interface SatDteListRow {
  uuid: string
  flow: SatDteFlow
  label: string
  name: string
  serie: string | null
  tipo: string | null
  numero: string | null
  date: string | null
  amount: number
  partnerName: string | null
  partnerNit: string | null
  anulado: boolean
  lineSummary: string | null
}

export function satFelExternalRef(uuid: string): string {
  return `sat-gt:fel:${uuid}`
}
