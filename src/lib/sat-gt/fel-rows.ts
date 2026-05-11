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

/**
 * Lista de DTE en la respuesta JSON de consulta-dte (el SAT ha variado la forma de `detalle`).
 */
export function extractConsultaDteList(responseData: unknown): Record<string, unknown>[] {
  if (!isRecord(responseData)) return []

  const root = responseData
  const detalle = root.detalle

  if (Array.isArray(detalle)) return arrayOfRecords(detalle)

  if (isRecord(detalle)) {
    if (Array.isArray(detalle.data)) return arrayOfRecords(detalle.data)
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
    ]) {
      if (Array.isArray(detalle[key])) return arrayOfRecords(detalle[key])
    }
  }

  for (const key of ["data", "lista", "registros", "dtes", "resultado", "documentos"]) {
    if (Array.isArray(root[key])) return arrayOfRecords(root[key])
  }

  return []
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

  return { codigo, mensaje }
}

export function countNormalizedRows(list: Record<string, unknown>[], operation: "E" | "R"): number {
  let n = 0
  for (const raw of list) {
    if (normalizeSatDteRecord(raw, operation, null)) n++
  }
  return n
}
