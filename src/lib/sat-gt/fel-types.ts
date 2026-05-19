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
  /**
   * Rango solicitado vs rango efectivo en las peticiones al SAT.
   * Si «hasta» o «desde» son futuras en UTC, el scraper acota por defecto (salvo SAT_FEL_DISABLE_DATE_CLAMP=1).
   */
  queryWindow?: {
    dateFrom: string
    dateTo: string
    /** Fechas realmente enviadas a consulta-dte / zip-xml (pueden coincidir con dateFrom/dateTo). */
    effectiveDateFrom?: string
    effectiveDateTo?: string
    utcToday: string
    /** La fecha «hasta» pedida por el usuario supera hoy UTC (antes de acotar). */
    dateToAfterUtcToday: boolean
    /** Se aplicó acotación automática del rango (por defecto activa). */
    datesClamped?: boolean
  }
  /** Eco de parámetros de consulta-dte (R y establecimiento) para comparar con el portal / moore-rpa. */
  felQueryEcho?: {
    nitIdReceptorRecibidos: { sent: boolean; reasonKey: string }
    /** Valores enviados en fechaEmisionIni / fechaEmisionFinal (último formato que funcionó). */
    fechaEmisionIni?: string
    fechaEmisionFinal?: string
    /** `vacio` (moore por defecto), `0` (SAT_FEL_CONSULTA_ESTABLECIMIENTO_ZERO=1), `custom` (SAT_FEL_ESTABLECIMIENTO_CONSULTA). */
    establecimientoConsulta: string
    /** Reintentos de consulta-dte por variables de entorno (p. ej. `establecimiento_zero`). */
    reintentosConsulta?: string[]
    /** `true` si compras (R) se consultaron enviando `nitIdReceptor` igual a `usuario=` (reintento SAT_FEL_EMPTY_RETRY_R_DUPLICATE_NIT). */
    recibidosNitIdReceptorForzado?: boolean
  }
  responseHints?: {
    emitidos: SatFelResponseShapeHint
    recibidos: SatFelResponseShapeHint
  }
  /** Orden cronológico: navegador, API consulta-dte, zip-xml, normalización. */
  checkpoints?: SatFelCheckpoint[]
}
