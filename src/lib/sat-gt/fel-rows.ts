import type { SatDteListRow } from "./fel-types"

function isRecord(x: unknown): x is Record<string, unknown> {
  return x != null && typeof x === "object" && !Array.isArray(x)
}

function pickStr(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k]
    if (v != null && String(v).trim() !== "") return String(v).trim()
  }
  return null
}

export function parseGtDateString(s: string | null): string | null {
  if (!s) return null
  const t = s.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) {
    const dd = m[1].padStart(2, "0")
    const mm = m[2].padStart(2, "0")
    return `${m[3]}-${mm}-${dd}`
  }
  return null
}

export function parseGtAmount(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === "number" && Number.isFinite(v)) return v
  const s = String(v).replace(/,/g, "").replace(/\s/g, "").trim()
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

const AMOUNT_KEYS = [
  "granTotal",
  "GranTotal",
  "montoTotal",
  "MontoTotal",
  "total",
  "Total",
  "importeTotal",
  "ImporteTotal",
  "valorTotal",
  "ValorTotal",
  "monto",
  "Monto",
  "importe",
  "Importe",
  "totalFactura",
  "TotalFactura",
  "totalDocumento",
  "montoFactura",
  "totalGeneral",
  "TotalGeneral",
  "montoGravable",
  "MontoGravable",
]

/** Busca monto en campos habituales del JSON consulta-dte y en un objeto hijo (totales, montos, etc.). */
export function extractFelAmount(raw: Record<string, unknown>): number | null {
  for (const k of AMOUNT_KEYS) {
    const n = parseGtAmount(raw[k])
    if (n != null) return n
  }
  for (const nestedKey of ["totales", "Totales", "montos", "Montos", "resumen", "Resumen", "importes", "Importes"]) {
    const nested = raw[nestedKey]
    if (!isRecord(nested)) continue
    for (const k of AMOUNT_KEYS) {
      const n = parseGtAmount(nested[k])
      if (n != null) return n
    }
  }
  return null
}

const UUID_KEYS = [
  "numeroUuid",
  "numeroUUID",
  "uuid",
  "UUID",
  "UUID_DTE",
  "uuidDte",
  "idDte",
  "idDocumento",
  "numeroAutorizacionUuid",
  "NumeroAutorizacionUuid",
]

function pickUuid(raw: Record<string, unknown>): string | null {
  const u = pickStr(raw, UUID_KEYS)
  return u?.trim() || null
}

/** UUID / clave de deduplicación entre páginas de consulta-dte. */
export function getFelDteUuid(row: Record<string, unknown>): string | null {
  return pickUuid(row)
}

function isAnulado(raw: Record<string, unknown>): boolean {
  const a = pickStr(raw, ["anulado", "Anulado", "estaAnulado", "indicadorAnulado"])
  if (!a) return false
  const u = a.toUpperCase()
  return u === "S" || u === "Y" || u === "TRUE" || u === "1" || u === "SI" || u === "SÍ"
}

function buildName(raw: Record<string, unknown>, uuid: string): string {
  const serie = pickStr(raw, ["serie", "Serie"])
  const num = pickStr(raw, ["numero", "numeroDocumento", "noDocumento", "numeroDte", "Numero"])
  if (serie && num) return `${serie}-${num}`.slice(0, 120)
  if (num) return num.slice(0, 120)
  return uuid.slice(0, 120)
}

function buildLabel(operation: "E" | "R", raw: Record<string, unknown>): string {
  const tipo = pickStr(raw, ["tipoDte", "tipoDTE", "tipo", "tipoDocumento", "descripcionTipo"]) || "DTE"
  const tag = operation === "E" ? "Emitida" : "Recibida"
  return `${tag} · ${tipo}`
}

/** Convierte un registro crudo del JSON de consulta-dte + items XML opcionales. */
export function normalizeSatDteRecord(
  raw: Record<string, unknown>,
  operation: "E" | "R",
  lineSummary: string | null
): SatDteListRow | null {
  const uuid = pickUuid(raw)
  if (!uuid) return null

  const amount = extractFelAmount(raw)
  if (amount == null) return null

  const dateRaw = pickStr(raw, [
    "fechaEmision",
    "fecha_emision",
    "fechaEmisionDte",
    "fecha",
    "FechaEmision",
    "fechaDocumento",
  ])
  const date = parseGtDateString(dateRaw)

  const anulado = isAnulado(raw)
  const name = buildName(raw, uuid)
  const label = buildLabel(operation, raw)
  const serie = pickStr(raw, ["serie", "Serie"])
  const tipo = pickStr(raw, ["tipoDte", "tipoDTE", "tipo", "tipoDocumento"])
  const numero = pickStr(raw, ["numero", "numeroDocumento", "noDocumento", "numeroDte", "Numero"])

  if (operation === "E") {
    return {
      uuid,
      flow: "income",
      label,
      name,
      serie,
      tipo,
      numero,
      date,
      amount: Math.abs(amount),
      partnerName: pickStr(raw, ["nombreReceptor", "nombre_receptor", "NombreReceptor"]),
      partnerNit: pickStr(raw, ["nitReceptor", "nit_receptor", "NitReceptor"]),
      anulado,
      lineSummary,
    }
  }

  return {
    uuid,
    flow: "expense",
    label,
    name,
    serie,
    tipo,
    numero,
    date,
    amount: Math.abs(amount),
    partnerName: pickStr(raw, ["nombreEmisor", "nombre_emisor", "NombreEmisor"]),
    partnerNit: pickStr(raw, ["nitEmisor", "nit_emisor", "NitEmisor"]),
    anulado,
    lineSummary,
  }
}

function arrayOfRecords(v: unknown): Record<string, unknown>[] {
  if (!Array.isArray(v)) return []
  return v.filter(isRecord)
}

/** `detalle` a veces viene como string JSON; la raíz puede ser string. */
export function unwrapFelConsultaResponse(responseData: unknown): unknown {
  let root: unknown = responseData
  if (typeof root === "string") {
    try {
      root = JSON.parse(root) as unknown
    } catch {
      return responseData
    }
  }
  if (!isRecord(root)) return root
  const d = root.detalle
  if (typeof d === "string") {
    try {
      const parsed = JSON.parse(d) as unknown
      return { ...root, detalle: parsed }
    } catch {
      return root
    }
  }
  return root
}

/** El SAT a veces serializa `detalle.data` como string JSON en lugar de array. */
export function normalizeFelDetalleData(data: unknown): unknown {
  if (data == null) return data
  if (typeof data === "string") {
    const t = data.trim()
    if (!t) return []
    try {
      return JSON.parse(t) as unknown
    } catch {
      return data
    }
  }
  return data
}

function recordsFromMaybeArrayOrMap(v: unknown): Record<string, unknown>[] {
  const norm = normalizeFelDetalleData(v)
  if (Array.isArray(norm)) return arrayOfRecords(norm)
  if (isRecord(norm)) {
    const vals = Object.values(norm).filter(isRecord)
    if (vals.length > 0) return vals
  }
  return []
}

function extractConsultaDteListStructured(root: Record<string, unknown>): Record<string, unknown>[] {
  const detalle = root.detalle

  if (Array.isArray(detalle)) return arrayOfRecords(detalle)

  if (isRecord(detalle)) {
    const fromData = recordsFromMaybeArrayOrMap(detalle.data)
    if (fromData.length > 0) return fromData
    for (const key of [
      "lista",
      "registros",
      "dtes",
      "items",
      "rows",
      "content",
      "listaDte",
      "resultados",
      "documentos",
      "listaDocumento",
      "listaDocumentos",
      "detalleLista",
      "listado",
    ]) {
      const fromKey = recordsFromMaybeArrayOrMap(detalle[key])
      if (fromKey.length > 0) return fromKey
    }
  }

  for (const key of ["data", "lista", "registros", "dtes", "resultado", "documentos"]) {
    const fromRoot = recordsFromMaybeArrayOrMap(root[key])
    if (fromRoot.length > 0) return fromRoot
  }

  return []
}

function rowLooksLikeFelDte(row: Record<string, unknown>): boolean {
  if (pickUuid(row)) return true
  if (extractFelAmount(row) != null) return true
  for (const k of Object.keys(row)) {
    if (/nit(emisor|receptor|proveedor)|tipoDte|serie|numero|autorizacion|dte|fel/i.test(k)) return true
  }
  return false
}

function scoreDteCandidateArray(arr: Record<string, unknown>[]): number {
  if (arr.length === 0) return 0
  let score = Math.min(arr.length, 5000) * 2
  for (const row of arr.slice(0, 5)) {
    if (pickUuid(row)) score += 40
    if (extractFelAmount(row) != null) score += 25
    if (rowLooksLikeFelDte(row)) score += 10
  }
  return score
}

function deepCollectDteCandidateArrays(value: unknown, depth: number, out: Record<string, unknown>[][]): void {
  if (depth > 10 || value == null) return
  if (Array.isArray(value)) {
    const recs = arrayOfRecords(value)
    if (recs.length > 0 && recs.some(rowLooksLikeFelDte)) {
      out.push(recs)
    }
    for (const el of value) {
      deepCollectDteCandidateArrays(el, depth + 1, out)
    }
    return
  }
  if (!isRecord(value)) return
  for (const v of Object.values(value)) {
    deepCollectDteCandidateArrays(v, depth + 1, out)
  }
}

function deepFindBestDteRecordArray(root: Record<string, unknown>): Record<string, unknown>[] {
  const candidates: Record<string, unknown>[][] = []
  deepCollectDteCandidateArrays(root, 0, candidates)
  if (candidates.length === 0) return []
  candidates.sort((a, b) => scoreDteCandidateArray(b) - scoreDteCandidateArray(a))
  return candidates[0] ?? []
}

/**
 * Lista de DTE en la respuesta JSON de consulta-dte (el SAT ha variado la forma de `detalle`).
 */
export function extractConsultaDteList(responseData: unknown): Record<string, unknown>[] {
  const root = unwrapFelConsultaResponse(responseData)
  if (!isRecord(root)) return []

  const structured = extractConsultaDteListStructured(root)
  if (structured.length > 0) return structured

  return deepFindBestDteRecordArray(root)
}

/** Extrae `detalle.data` y totales típicos de la paginación del SAT (`total`, `totalPagina`). */
export function getConsultaDtePagedSlice(responseData: unknown): {
  rows: Record<string, unknown>[]
  totalReported: number
  pageSizeHint: number | null
  /** Número de páginas que indica el SAT (`totalPagina`); útil si `data` viene vacío sin `pagina=1`. */
  totalPaginaReported: number | null
} {
  const root = unwrapFelConsultaResponse(responseData)
  if (!isRecord(root)) {
    return { rows: [], totalReported: 0, pageSizeHint: null, totalPaginaReported: null }
  }

  const det = root.detalle
  if (!isRecord(det)) {
    return { rows: [], totalReported: 0, pageSizeHint: null, totalPaginaReported: null }
  }

  const dataNorm = normalizeFelDetalleData(det.data)
  let rows: Record<string, unknown>[] = []
  if (Array.isArray(dataNorm)) rows = arrayOfRecords(dataNorm)
  else if (isRecord(dataNorm)) rows = Object.values(dataNorm).filter(isRecord)

  const totalRaw = det.total ?? det.Total ?? det.totalRegistros ?? det.totalElementos
  let totalReported = 0
  if (typeof totalRaw === "number" && Number.isFinite(totalRaw)) totalReported = Math.trunc(totalRaw)
  else if (totalRaw != null) {
    const n = parseInt(String(totalRaw).replace(/[^\d]/g, "") || "0", 10)
    totalReported = Number.isFinite(n) ? n : 0
  }

  totalReported = Math.max(totalReported, rows.length)

  const tpRaw = det.totalPagina ?? det.TotalPagina ?? det.totalPages ?? det.numeroPaginas
  let totalPaginaReported: number | null = null
  if (typeof tpRaw === "number" && Number.isFinite(tpRaw) && tpRaw > 0) {
    totalPaginaReported = Math.trunc(tpRaw)
  } else if (tpRaw != null) {
    const n = parseInt(String(tpRaw).replace(/[^\d]/g, ""), 10)
    totalPaginaReported = Number.isFinite(n) && n > 0 ? n : null
  }

  const ps = det.tamanoPagina ?? det.tamano ?? det.pageSize ?? det.rows ?? det.registrosPorPagina
  let pageSizeHint: number | null = null
  if (typeof ps === "number" && Number.isFinite(ps) && ps > 0) pageSizeHint = Math.trunc(ps)
  else if (ps != null) {
    const n = parseInt(String(ps).replace(/[^\d]/g, ""), 10)
    pageSizeHint = Number.isFinite(n) && n > 0 ? n : null
  }

  return { rows, totalReported, pageSizeHint, totalPaginaReported }
}

export function isFelCodigoClientError(codigo: string | null | undefined): boolean {
  if (codigo == null) return false
  const u = String(codigo).toUpperCase()
  return u.includes("BAD") || u.includes("ERROR") || u === "BAD_REQUEST" || u === "FORBIDDEN"
}

export function describeFelResponseShape(responseData: unknown): {
  rootKeys: string[]
  detalleKind: string
  detalleKeys: string[] | null
  maxArrayLengthSeen: number
} {
  const root = unwrapFelConsultaResponse(responseData)
  if (!isRecord(root)) {
    return { rootKeys: [], detalleKind: typeof root, detalleKeys: null, maxArrayLengthSeen: 0 }
  }
  const rootKeys = Object.keys(root)
  const det = root.detalle
  let detalleKind = Array.isArray(det) ? "array" : typeof det
  let detalleKeys: string[] | null = null
  if (isRecord(det)) {
    detalleKind = "object"
    detalleKeys = Object.keys(det)
  }
  let maxLen = 0
  const walk = (v: unknown, d: number) => {
    if (d > 8 || v == null) return
    if (Array.isArray(v)) {
      maxLen = Math.max(maxLen, v.length)
      for (const x of v.slice(0, 3)) walk(x, d + 1)
      return
    }
    if (isRecord(v)) for (const x of Object.values(v)) walk(x, d + 1)
  }
  walk(root, 0)
  if (isRecord(det)) {
    const dn = normalizeFelDetalleData(det.data)
    if (Array.isArray(dn)) maxLen = Math.max(maxLen, dn.length)
  }
  return { rootKeys, detalleKind, detalleKeys, maxArrayLengthSeen: maxLen }
}

/** Código y mensaje habituales en respuestas FEL. */
export function felMessageFromResponse(data: unknown): { codigo: string | null; mensaje: string | null } {
  if (!isRecord(data)) return { codigo: null, mensaje: null }
  const codigo =
    data.codigo != null
      ? String(data.codigo)
      : data.Codigo != null
        ? String(data.Codigo)
        : data.code != null
          ? String(data.code)
          : null

  let mensaje = pickStr(data, ["mensaje", "Mensaje", "descripcion", "Descripcion", "mensajeUsuario", "error", "Error"])
  if (!mensaje && typeof data.detalle === "string") mensaje = data.detalle.trim() || null

  if (isRecord(data.detalle)) {
    const inner = data.detalle
    const innerMsg = pickStr(inner, ["mensaje", "Mensaje", "descripcion", "descripcionError", "error"])
    if (innerMsg) mensaje = mensaje ? `${mensaje} · ${innerMsg}` : innerMsg
    const innerCode = inner.codigo ?? inner.Codigo
    if (innerCode != null && codigo == null) {
      return { codigo: String(innerCode), mensaje }
    }
  }

  return { codigo, mensaje }
}

export function countNormalizedRows(list: Record<string, unknown>[], operation: "E" | "R"): number {
  let n = 0
  for (const raw of list) {
    if (normalizeSatDteRecord(raw, operation, null)) n++
  }
  return n
}
