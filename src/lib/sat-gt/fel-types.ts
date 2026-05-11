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

/** Resumen de la respuesta consulta-dte (para diagnóstico en UI). */
export interface SatFelConsultaDiag {
  rawListLength: number
  normalizedCount: number
  codigo: string | null
  mensaje: string | null
}

export interface SatFelRunDiagnostics {
  emitidos: SatFelConsultaDiag
  recibidos: SatFelConsultaDiag
  /** Usuario enviado en el query `usuario=` de la API FEL (suele ser el NIT). */
  felConsultaUsuario: string
}
