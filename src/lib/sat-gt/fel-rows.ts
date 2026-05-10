import type { SatDteListRow } from "./fel-types"

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
  const uuid = pickStr(raw, ["numeroUuid", "numeroUUID", "uuid", "UUID", "UUID_DTE"])
  if (!uuid) return null

  const amount =
    parseGtAmount(
      raw.granTotal ??
        raw.GranTotal ??
        raw.montoTotal ??
        raw.MontoTotal ??
        raw.total ??
        raw.Total
    ) ?? null
  if (amount == null) return null

  const dateRaw = pickStr(raw, [
    "fechaEmision",
    "fecha_emision",
    "fechaEmisionDte",
    "fecha",
    "FechaEmision",
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

export function extractConsultaDteList(responseData: unknown): Record<string, unknown>[] {
  if (!responseData || typeof responseData !== "object") return []
  const o = responseData as { detalle?: { data?: unknown } }
  const data = o.detalle?.data
  if (!Array.isArray(data)) return []
  return data.filter((x): x is Record<string, unknown> => x != null && typeof x === "object")
}
