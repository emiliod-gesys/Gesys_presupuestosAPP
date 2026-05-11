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
  /** `detalle.total` del SAT (puede ser mayor que filas en `data` si hay paginación). */
  satTotalRegistros?: number | null
  /** `detalle.totalPagina` u homólogo (útil si `data` viene vacío en la primera respuesta). */
  satTotalPagina?: number | null
}

/** Pistas de forma del JSON (sin datos sensibles). */
export interface SatFelResponseShapeHint {
  rootKeys: string[]
  detalleKind: string
  detalleKeys: string[] | null
  maxArrayLengthSeen: number
}

export interface SatFelRunDiagnostics {
  emitidos: SatFelConsultaDiag
  recibidos: SatFelConsultaDiag
  /** Usuario enviado en el query `usuario=` de la API FEL (suele ser el NIT). */
  felConsultaUsuario: string
  /** Formato de fecha usado en la URL de consulta-dte (último intento que devolvió datos o el reintento). */
  felDateFormatUsed?: "iso" | "ddmmyyyy"
  responseHints?: {
    emitidos: SatFelResponseShapeHint
    recibidos: SatFelResponseShapeHint
  }
}
