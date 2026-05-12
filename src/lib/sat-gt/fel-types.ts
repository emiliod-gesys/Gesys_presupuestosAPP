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

/** Trazas de alto nivel (sin tokens ni contraseñas). */
export interface SatFelCheckpoint {
  stage: string
  /** Milisegundos desde el inicio de la operación (extracción o importación). */
  atMs: number
  detail?: string
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
  /** Tras normalizar string JSON: tipo de `detalle.data`. */
  detalleDataKind?: string | null
  /** Longitud del array `data`, caracteres si es string, o número de claves si es objeto. */
  detalleDataEntryCount?: number | null
}

export interface SatFelRunDiagnostics {
  emitidos: SatFelConsultaDiag
  recibidos: SatFelConsultaDiag
  /** Valor real del parámetro `usuario=` en consulta-dte / zip-xml (reference/moore-rpa: mismo usuario con el que inicias sesión en farm3). */
  felConsultaUsuario: string
  /** NIT del perfil (solo referencia; puede no coincidir con `usuario=` en la URL). */
  felNitPerfil?: string | null
  /** Formato de fecha usado en la URL de consulta-dte (último intento que devolvió datos o el reintento). */
  felDateFormatUsed?: "iso" | "ddmmyyyy"
  /** Rango enviado al SAT y si «hasta» queda en el futuro respecto al día UTC del servidor (suele dar total 0). */
  queryWindow?: {
    dateFrom: string
    dateTo: string
    utcToday: string
    dateToAfterUtcToday: boolean
  }
  responseHints?: {
    emitidos: SatFelResponseShapeHint
    recibidos: SatFelResponseShapeHint
  }
  /** Orden cronológico: navegador, API consulta-dte, zip-xml, normalización. */
  checkpoints?: SatFelCheckpoint[]
}
