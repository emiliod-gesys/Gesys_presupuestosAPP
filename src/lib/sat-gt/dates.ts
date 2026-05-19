/** Fechas para consulta DTE: ISO (YYYY-MM-DD) en API; dd/MM/yyyy en UI guatemalteca. */

const ISO_YMD = /^(\d{4})-(\d{2})-(\d{2})$/

export function isIsoDateYmd(s: string): boolean {
  return ISO_YMD.test(s.trim())
}

export function parseIsoDateYmd(iso: string): { y: number; m: number; d: number } | null {
  const m = ISO_YMD.exec(iso.trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (!Number.isFinite(y) || mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const dt = new Date(y, mo - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null
  return { y, m: mo, d }
}

export function isoDateYmdFromParts(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

/** dd/MM/yyyy para mostrar en UI (día primero, como en Guatemala). */
export function isoToDdMmYyyyDisplay(iso: string): string {
  const p = parseIsoDateYmd(iso)
  if (!p) return ""
  return `${String(p.d).padStart(2, "0")}/${String(p.m).padStart(2, "0")}/${p.y}`
}

/**
 * Parsea dd/mm/aaaa o d/m/aaaa (día / mes / año). No acepta mm/dd.
 * Devuelve YYYY-MM-DD o null.
 */
export function parseDdMmYyyyToIso(input: string): string | null {
  const t = input.trim()
  if (!t) return null
  if (isIsoDateYmd(t)) return t
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t)
  if (!m) return null
  const d = Number(m[1])
  const mo = Number(m[2])
  const y = Number(m[3])
  if (d < 1 || d > 31 || mo < 1 || mo > 12 || y < 2000 || y > 2100) return null
  const dt = new Date(y, mo - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null
  return isoDateYmdFromParts(y, mo, d)
}

/** dd/MM/yyyy para parámetros fechaEmision* del SAT (algunos despliegues). */
export function isoToFelDdMmYyyy(iso: string): string {
  const p = parseIsoDateYmd(iso)
  if (!p) return iso.trim()
  return `${String(p.d).padStart(2, "0")}/${String(p.m).padStart(2, "0")}/${p.y}`
}

export function defaultSatDateRangeIso(): { from: string; to: string } {
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), 1)
  return {
    from: isoDateYmdFromParts(start.getFullYear(), start.getMonth() + 1, start.getDate()),
    to: isoDateYmdFromParts(today.getFullYear(), today.getMonth() + 1, today.getDate()),
  }
}
