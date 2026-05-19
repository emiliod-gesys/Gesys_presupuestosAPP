import axios, { type AxiosError } from "axios"
import JSZip from "jszip"
import type { Page } from "puppeteer-core"
import { parseStringPromise } from "xml2js"
import {
  extractConsultaDteList,
  felMessageFromResponse,
  getConsultaDtePagedSlice,
  getFelDteUuid,
  isFelCodigoClientError,
  unwrapFelConsultaResponse,
} from "./fel-rows"

import { isoToFelDdMmYyyy } from "./dates"

/** Algunas despliegues del SAT esperan dd/MM/yyyy en el query en lugar de ISO. */
export function isoDateToDdMmYyyy(iso: string): string {
  return isoToFelDdMmYyyy(iso)
}

/** Valores de fechaEmisionIni/Final tal como van en la URL (sin token). */
export function felConsultaDateQueryValues(
  startIso: string,
  endIso: string,
  fmt: FelConsultaDateFormat,
  dateRangeKind: FelConsultaDateRangeKind = "emision"
): { fechaEmisionIni: string; fechaEmisionFinal: string; fechaRecepcionIni?: string; fechaRecepcionFinal?: string } {
  const s = fmt === "ddmmyyyy" ? isoToFelDdMmYyyy(startIso) : startIso.trim()
  const e = fmt === "ddmmyyyy" ? isoToFelDdMmYyyy(endIso) : endIso.trim()
  if (dateRangeKind === "recepcion") {
    return { fechaEmisionIni: "", fechaEmisionFinal: "", fechaRecepcionIni: s, fechaRecepcionFinal: e }
  }
  if (dateRangeKind === "both") {
    return { fechaEmisionIni: s, fechaEmisionFinal: e, fechaRecepcionIni: s, fechaRecepcionFinal: e }
  }
  return { fechaEmisionIni: s, fechaEmisionFinal: e }
}

export type FelConsultaDateFormat = "iso" | "ddmmyyyy"

/** Campo de fecha en consulta-dte; recibidas en el portal suelen usar recepción, no emisión. */
export type FelConsultaDateRangeKind = "emision" | "recepcion" | "both"

export type FelConsultaDteOpts = {
  dateFormat?: FelConsultaDateFormat
  /** Qué parámetros de fecha enviar (solo afecta la parte de fechas en la URL). */
  dateRangeKind?: FelConsultaDateRangeKind
  /** Paginación (portal FEL): suele ir con `tamanoPagina`. */
  pagina?: number
  tamanoPagina?: number
  onCheckpoint?: (stage: string, detail?: string) => void
  /**
   * NIT del perfil (receptor): en `R` se envía en `nitIdReceptor` solo si **diffiere** de `usuario=` (p. ej. correo en
   * login y NIT en perfil). Si login y NIT son el mismo valor, se deja vacío como moore-rpa (duplicar puede vaciar la respuesta).
   * `SAT_FEL_OMIT_NIT_RECEPTOR=1`: siempre vacío. Sin NIT aquí y `SAT_FEL_NIT_RECEPTOR_QUERY=1`: se usa `usuario=`.
   */
  nitReceptorQueryValue?: string
  /**
   * Si true, en R se envía `nitIdReceptor` aunque coincida con `usuario=` (reintento / despliegues del SAT que lo exigen).
   */
  forceNitIdReceptorWhenSameUsuario?: boolean
  /** Si true, esta petición usa `establecimiento=0` en la URL de consulta-dte (no el vacío por defecto). */
  consultaEstablecimientoForceZero?: boolean
}

function felIdsEquivalentForReceptor(a: string, b: string): boolean {
  const da = a.replace(/\D/g, "")
  const db = b.replace(/\D/g, "")
  return da.length > 0 && db.length > 0 && da === db
}

export function felIdsEquivalentUsuarioNit(usuario: string, nit: string): boolean {
  return felIdsEquivalentForReceptor(usuario, nit)
}

/** Valor de `nitIdReceptor` en consulta-dte / zip-xml para operación R. */
export function felNitIdReceptorQueryParam(
  operationType: "E" | "R",
  usuario: string,
  nitReceptorQueryValue?: string,
  forceWhenSameUsuario?: boolean
): string {
  if (operationType !== "R" || process.env.SAT_FEL_OMIT_NIT_RECEPTOR === "1") return ""
  const explicit = nitReceptorQueryValue?.trim() ?? ""
  const u = usuario.trim()
  if (explicit !== "") {
    if (
      !forceWhenSameUsuario &&
      !process.env.SAT_FEL_FORCE_NIT_RECEPTOR &&
      felIdsEquivalentForReceptor(explicit, u)
    ) {
      return ""
    }
    return encodeURIComponent(explicit)
  }
  if (process.env.SAT_FEL_NIT_RECEPTOR_QUERY === "1" && u !== "") {
    return encodeURIComponent(u)
  }
  return ""
}

/** Para diagnóstico UI (sin exponer el NIT completo). */
export function felNitIdReceptorQueryExplain(
  usuario: string,
  nitReceptorQueryValue?: string | null
): { sent: boolean; reasonKey: string } {
  if (process.env.SAT_FEL_OMIT_NIT_RECEPTOR === "1") return { sent: false, reasonKey: "omit_env" }
  const explicit = nitReceptorQueryValue?.trim() ?? ""
  const u = usuario.trim()
  if (explicit !== "") {
    if (!process.env.SAT_FEL_FORCE_NIT_RECEPTOR && felIdsEquivalentForReceptor(explicit, u)) {
      return { sent: false, reasonKey: "omit_same_as_usuario" }
    }
    if (process.env.SAT_FEL_FORCE_NIT_RECEPTOR && felIdsEquivalentForReceptor(explicit, u)) {
      return { sent: true, reasonKey: "forced_same" }
    }
    return { sent: true, reasonKey: "perfil_distinto" }
  }
  if (process.env.SAT_FEL_NIT_RECEPTOR_QUERY === "1" && u !== "") return { sent: true, reasonKey: "legacy_usuario" }
  return { sent: false, reasonKey: "omit_sin_nit_perfil" }
}

/** Cabeceras extra en axios (Referer/Origin); moore-rpa solo usa Authorization + Cookie. */
const FELCONS_EXTRA_AXIOS_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Referer: "https://felcons.c.sat.gob.gt/dte-agencia-virtual/dte-consulta",
  Origin: "https://felcons.c.sat.gob.gt",
  Accept: "application/json, text/plain, */*",
} as const

function felConsultaAxiosHeaders(token: string, cookieHeader: string): Record<string, string> {
  const base: Record<string, string> = {
    Authorization: token.trim(),
    Cookie: cookieHeader,
  }
  if (process.env.SAT_FEL_EXTRA_AXIOS_HEADERS === "1") {
    return { ...base, ...FELCONS_EXTRA_AXIOS_HEADERS }
  }
  return base
}

function felDateRangeQuery(
  startIso: string,
  endIso: string,
  fmt: FelConsultaDateFormat,
  kind: FelConsultaDateRangeKind
): string {
  const s = fmt === "ddmmyyyy" ? isoDateToDdMmYyyy(startIso) : startIso.trim()
  const e = fmt === "ddmmyyyy" ? isoDateToDdMmYyyy(endIso) : endIso.trim()
  const es = encodeURIComponent(s)
  const ee = encodeURIComponent(e)
  if (kind === "recepcion") {
    return `fechaEmisionIni=&fechaEmisionFinal=&fechaRecepcionIni=${es}&fechaRecepcionFinal=${ee}`
  }
  if (kind === "both") {
    return `fechaEmisionIni=${es}&fechaEmisionFinal=${ee}&fechaRecepcionIni=${es}&fechaRecepcionFinal=${ee}`
  }
  return `fechaEmisionIni=${es}&fechaEmisionFinal=${ee}`
}

/** URL de consulta-dte (mismos parámetros que moore-rpa). */
export function buildFelConsultaDteUrl(
  user: string,
  startDate: string,
  endDate: string,
  operationType: "E" | "R",
  opts?: FelConsultaDteOpts
): string {
  const fmt = opts?.dateFormat ?? "iso"
  const dateKind = opts?.dateRangeKind ?? "emision"
  const nitReceptor = felNitIdReceptorQueryParam(
    operationType,
    user,
    opts?.nitReceptorQueryValue,
    opts?.forceNitIdReceptorWhenSameUsuario === true
  )
  const est = consultaDteEstablecimientoQuery(opts?.consultaEstablecimientoForceZero === true)
  const dateQs = felDateRangeQuery(startDate, endDate, fmt, dateKind)
  let url =
    `https://felcons.c.sat.gob.gt/dte-agencia-virtual/api/consulta-dte?usuario=${encodeURIComponent(user)}` +
    `&tipoOperacion=${operationType}&establecimiento=${est}&tipoDte=&noAutorizacion=&nitIdReceptor=${nitReceptor}&estadoDte=&serie=&numero=&moneda=&montoTotalRangoIni=&montoTotalRangoFinal=&impuesto=&nitCertificador=&resultado=&${dateQs}`
  if (opts?.pagina != null && opts.pagina > 0) {
    url += `&pagina=${encodeURIComponent(String(opts.pagina))}`
  }
  if (opts?.tamanoPagina != null && opts.tamanoPagina > 0) {
    url += `&tamanoPagina=${encodeURIComponent(String(opts.tamanoPagina))}`
  }
  return url
}

/** GET consulta-dte desde la pestaña felcons (cookies de sesión del portal). */
export async function fetchFelConsultaDteViaPage(page: Page, token: string, url: string): Promise<unknown> {
  const auth = token.trim()
  return page.evaluate(
    async (requestUrl, authorization) => {
      const res = await fetch(requestUrl, {
        method: "GET",
        credentials: "include",
        headers: {
          Authorization: authorization,
          Accept: "application/json, text/plain, */*",
        },
      })
      const text = await res.text()
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 240)}`)
      }
      try {
        return JSON.parse(text) as unknown
      } catch {
        throw new Error(`Respuesta no JSON: ${text.slice(0, 160)}`)
      }
    },
    url,
    auth
  )
}

function consultaDteEstablecimientoQuery(forceZero?: boolean): string {
  if (forceZero) return encodeURIComponent("0")
  const v = process.env.SAT_FEL_ESTABLECIMIENTO_CONSULTA?.trim()
  if (v !== undefined && v !== "") return encodeURIComponent(v)
  if (process.env.SAT_FEL_CONSULTA_ESTABLECIMIENTO_ZERO === "1") return encodeURIComponent("0")
  /** Vacío como `reference/moore-rpa-main` GET consulta-dte. */
  return ""
}

export function felConsultaEstablecimientoExplain(): string {
  const v = process.env.SAT_FEL_ESTABLECIMIENTO_CONSULTA?.trim()
  if (v !== undefined && v !== "") return "custom"
  if (process.env.SAT_FEL_CONSULTA_ESTABLECIMIENTO_ZERO === "1") return "0"
  return "vacio"
}

export async function fetchFelConsultaDte(
  token: string,
  cookieHeader: string,
  user: string,
  startDate: string,
  endDate: string,
  operationType: "E" | "R",
  opts?: FelConsultaDteOpts
): Promise<unknown> {
  const url = buildFelConsultaDteUrl(user, startDate, endDate, operationType, opts)

  try {
    const response = await axios.get(url, {
      headers: felConsultaAxiosHeaders(token, cookieHeader),
    })
    return response.data
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError
      console.error("[fetchFelConsultaDte] Request failed", {
        message: axiosError.message,
        operationType,
        responseStatus: axiosError.response?.status,
        responseData: axiosError.response?.data,
      })
    }
    throw error
  }
}

/**
 * Une páginas de consulta-dte cuando `detalle.total` > filas en `detalle.data`.
 * La **primera** petición va **sin** `pagina`/`tamanoPagina` (igual que integraciones clásicas); el SAT
 * responde BAD_REQUEST si se envían parámetros de paginación que no espera.
 */
export type FelConsultaDteMergedOpts = {
  dateFormat?: FelConsultaDateFormat
  dateRangeKind?: FelConsultaDateRangeKind
  /** Trazas internas (fusión de páginas); no incluir datos sensibles en `detail`. */
  onCheckpoint?: (stage: string, detail?: string) => void
  nitReceptorQueryValue?: string
  forceNitIdReceptorWhenSameUsuario?: boolean
  consultaEstablecimientoForceZero?: boolean
  /** Página en felcons tras login; prioriza fetch() del navegador (misma sesión que el portal). */
  felconsPage?: Page | null
}

export type FelRecibidasAttempt = {
  mode: string
  rowCount: number
}

/** Variantes de consulta R (recibidas): recepción vs emisión y nitIdReceptor. */
export async function fetchFelRecibidasBestEffort(
  token: string,
  cookieHeader: string,
  user: string,
  startDate: string,
  endDate: string,
  opts?: FelConsultaDteMergedOpts
): Promise<{ data: unknown; winningMode: string | null; attempts: FelRecibidasAttempt[] }> {
  const plan: Array<{
    mode: string
    dateRangeKind: FelConsultaDateRangeKind
    forceNit: boolean
    estZero: boolean
  }> = [
    { mode: "recepcion_nit_force", dateRangeKind: "recepcion", forceNit: true, estZero: false },
    { mode: "recepcion_nit_omit", dateRangeKind: "recepcion", forceNit: false, estZero: false },
    { mode: "both_nit_force", dateRangeKind: "both", forceNit: true, estZero: false },
    { mode: "emision_nit_force", dateRangeKind: "emision", forceNit: true, estZero: false },
    { mode: "recepcion_est0_nit_force", dateRangeKind: "recepcion", forceNit: true, estZero: true },
    { mode: "emision_nit_omit", dateRangeKind: "emision", forceNit: false, estZero: false },
  ]

  const attempts: FelRecibidasAttempt[] = []
  let lastData: unknown = {}

  for (const step of plan) {
    const data = await fetchFelConsultaDteMergedPages(token, cookieHeader, user, startDate, endDate, "R", {
      ...opts,
      dateFormat: opts?.dateFormat ?? "iso",
      dateRangeKind: step.dateRangeKind,
      forceNitIdReceptorWhenSameUsuario: step.forceNit,
      consultaEstablecimientoForceZero: step.estZero,
      onCheckpoint: (stage, detail) =>
        opts?.onCheckpoint?.(`r_${step.mode}.${stage}`, detail),
    })
    const rowCount = extractConsultaDteList(data).length
    attempts.push({ mode: step.mode, rowCount })
    lastData = data
    if (rowCount > 0) {
      return { data, winningMode: step.mode, attempts }
    }
  }

  return { data: lastData, winningMode: null, attempts }
}

export async function fetchFelConsultaDteMergedPages(
  token: string,
  cookieHeader: string,
  user: string,
  startDate: string,
  endDate: string,
  operationType: "E" | "R",
  opts?: FelConsultaDteMergedOpts
): Promise<unknown> {
  const fmt = opts?.dateFormat ?? "iso"
  const k = opts?.onCheckpoint
  const nitRv = opts?.nitReceptorQueryValue?.trim()
  k?.("start", `fmt=${fmt}`)

  async function one(extra: FelConsultaDteOpts): Promise<unknown> {
    const reqOpts: FelConsultaDteOpts = {
      dateFormat: fmt,
      ...(opts?.dateRangeKind ? { dateRangeKind: opts.dateRangeKind } : {}),
      ...(nitRv ? { nitReceptorQueryValue: nitRv } : {}),
      ...(opts?.forceNitIdReceptorWhenSameUsuario === true
        ? { forceNitIdReceptorWhenSameUsuario: true }
        : {}),
      ...(opts?.consultaEstablecimientoForceZero === true
        ? { consultaEstablecimientoForceZero: true }
        : {}),
      ...extra,
    }
    const url = buildFelConsultaDteUrl(user, startDate, endDate, operationType, reqOpts)
    const page = opts?.felconsPage
    if (page && process.env.SAT_FEL_DISABLE_BROWSER_FETCH !== "1") {
      try {
        k?.("transport", "browser")
        return await fetchFelConsultaDteViaPage(page, token, url)
      } catch (e) {
        k?.("browser_fetch_fail", (e as Error).message?.slice(0, 160))
      }
    }
    k?.("transport", "axios")
    return fetchFelConsultaDte(token, cookieHeader, user, startDate, endDate, operationType, reqOpts)
  }

  /** Algunos despliegues del SAT devuelven `data` vacío solo con `pagina`; con `tamanoPagina` sí hay filas. */
  async function consultaPagina(p: number): Promise<{ r: unknown; sn: ReturnType<typeof getConsultaDtePagedSlice> }> {
    let r = await one({ pagina: p })
    let sn = getConsultaDtePagedSlice(r)
    if (isFelCodigoClientError(felMessageFromResponse(r).codigo)) {
      const r2 = await one({ pagina: p, tamanoPagina: 20 })
      if (!isFelCodigoClientError(felMessageFromResponse(r2).codigo)) {
        return { r: r2, sn: getConsultaDtePagedSlice(r2) }
      }
      return { r, sn }
    }
    if (sn.rows.length > 0) return { r, sn }
    const r2 = await one({ pagina: p, tamanoPagina: 20 })
    if (isFelCodigoClientError(felMessageFromResponse(r2).codigo)) return { r, sn }
    const sn2 = getConsultaDtePagedSlice(r2)
    if (sn2.rows.length > 0 || sn2.totalReported > sn.totalReported) return { r: r2, sn: sn2 }
    return { r, sn }
  }

  let resp = await one({})
  const code0 = felMessageFromResponse(resp).codigo
  if (isFelCodigoClientError(code0)) {
    k?.("client_error_first", String(code0 ?? ""))
    return resp
  }

  let slice = getConsultaDtePagedSlice(resp)
  k?.(
    "first_response",
    `code=${code0 ?? "?"} rows=${slice.rows.length} total=${slice.totalReported} totalPagina=${slice.totalPaginaReported ?? 0}`
  )
  const merged: Record<string, unknown>[] = []
  const seen = new Set<string>()
  const pushDedup = (rows: Record<string, unknown>[]) => {
    for (const r of rows) {
      const id = getFelDteUuid(r) ?? `k:${JSON.stringify(Object.keys(r).sort())}:${merged.length}`
      if (seen.has(id)) continue
      seen.add(id)
      merged.push(r)
    }
  }
  pushDedup(slice.rows)

  let total = slice.totalReported
  const tp0 = slice.totalPaginaReported ?? 1

  /**
   * El SAT a veces responde ACCEPTED con `detalle.data` vacío en la petición **sin** `pagina`,
   * pero devuelve filas al pedir `pagina=1` explícita (el bucle de páginas 2..n nunca llegaba a la 1).
   */
  if (merged.length === 0) {
    const hint = Math.max(1, slice.pageSizeHint || 10)
    const maxFirstPass = Math.min(
      120,
      Math.max(tp0, total > 0 ? Math.ceil(total / hint) + 2 : 5)
    )
    for (let p = 1; p <= maxFirstPass; p++) {
      const { r, sn } = await consultaPagina(p)
      const c = felMessageFromResponse(r).codigo
      if (isFelCodigoClientError(c)) break
      const before = merged.length
      pushDedup(sn.rows)
      total = Math.max(total, sn.totalReported)
      if (sn.rows.length > 0) {
        resp = r
        slice = sn
      }
      if (total > 0 && merged.length >= total) break
    }
    k?.("page_scan_end", `merged=${merged.length} total=${total}`)
  }

  const pageSizeSlice = getConsultaDtePagedSlice(resp)
  const pageSize = Math.max(1, pageSizeSlice.pageSizeHint || pageSizeSlice.rows.length || 1)
  let page = 2
  const maxPages = 120

  while (merged.length < total && page <= maxPages) {
    const { r, sn: next } = await consultaPagina(page)
    const c = felMessageFromResponse(r).codigo
    if (isFelCodigoClientError(c)) break
    if (next.rows.length === 0) break
    const before = merged.length
    pushDedup(next.rows)
    if (merged.length === before) break
    total = Math.max(total, next.totalReported)
    page++
    if (next.rows.length < pageSize * 0.5 && merged.length >= total) break
  }

  k?.("merged", `rows=${merged.length} total=${Math.max(total, merged.length)} last_page=${page - 1}`)

  const base = unwrapFelConsultaResponse(resp)
  if (typeof base !== "object" || base == null || !("detalle" in base)) return resp
  const b = base as Record<string, unknown>
  const det = b.detalle
  if (typeof det !== "object" || det == null) return resp
  const d = det as Record<string, unknown>
  return {
    ...b,
    detalle: {
      ...d,
      data: merged,
      total: Math.max(total, merged.length),
    },
  }
}

export type FelXmlLine = { bienOServicio: string; descripcion: string }

export type FelXmlConverted = { uuid: string; items: FelXmlLine[] }

/** Descarga ZIP de XML, parsea y devuelve líneas resumidas por UUID (mismo criterio que moore-rpa). */
export async function fetchFelZipXmlLines(
  token: string,
  cookieHeader: string,
  user: string,
  startDate: string,
  endDate: string,
  operationType: "E" | "R",
  bodyRows: unknown[],
  opts?: FelConsultaDteOpts
): Promise<FelXmlConverted[]> {
  if (!Array.isArray(bodyRows) || bodyRows.length === 0) return []

  const fmt = opts?.dateFormat ?? "iso"
  opts?.onCheckpoint?.("start", `body_rows=${bodyRows.length}`)
  const s = fmt === "ddmmyyyy" ? isoDateToDdMmYyyy(startDate) : startDate
  const e = fmt === "ddmmyyyy" ? isoDateToDdMmYyyy(endDate) : endDate
  const nitReceptorZip = felNitIdReceptorQueryParam(
    operationType,
    user,
    opts?.nitReceptorQueryValue,
    opts?.forceNitIdReceptorWhenSameUsuario === true
  )
  const url =
    `https://felcons.c.sat.gob.gt/dte-agencia-virtual/api/consulta-dte/zip-xml?usuario=${encodeURIComponent(user)}` +
    `&tipoOperacion=${operationType}&establecimiento=0&tipoDte=TDS&noAutorizacion=&nitIdReceptor=${nitReceptorZip}&estadoDte=TDS&serie=&numero=&moneda=TDS&montoTotalRangoIni=&montoTotalRangoFinal=&impuesto=&nitCertificador=&resultado=&fechaEmisionIni=${encodeURIComponent(s)}&fechaEmisionFinal=${encodeURIComponent(e)}`

  const response = await axios.post<ArrayBuffer>(url, bodyRows, {
      headers: {
        ...felConsultaAxiosHeaders(token, cookieHeader),
        "Content-Type": "application/json",
      },
    responseType: "arraybuffer",
  })
  const buf = response.data
  opts?.onCheckpoint?.("http_ok", `bytes=${buf instanceof ArrayBuffer ? buf.byteLength : "?"}`)

  const zip = await JSZip.loadAsync(buf)
  const converted: FelXmlConverted[] = []

  for (const filename of Object.keys(zip.files)) {
    const file = zip.files[filename]
    if (!file || file.dir || !filename.toLowerCase().endsWith(".xml")) continue
    try {
      const xmlContent = await file.async("string")
      const parsed = await parseStringPromise(xmlContent)
      const fileRoot = parsed as Record<string, unknown>
      const gt = fileRoot["dte:GTDocumento"] as Record<string, unknown> | undefined
      const sat = gt?.["dte:SAT"] as unknown[] | undefined
      const sat0 = sat?.[0] as Record<string, unknown> | undefined
      const dte = sat0?.["dte:DTE"] as unknown[] | undefined
      const dte0 = dte?.[0] as Record<string, unknown> | undefined
      const emision = dte0?.["dte:DatosEmision"] as unknown[] | undefined
      const emision0 = emision?.[0] as Record<string, unknown> | undefined
      const items = emision0?.["dte:Items"] as unknown[] | undefined
      const cert = dte0?.["dte:Certificacion"] as unknown[] | undefined
      const cert0 = cert?.[0] as Record<string, unknown> | undefined
      const numAuth = cert0?.["dte:NumeroAutorizacion"] as unknown[] | undefined
      const na0 = numAuth?.[0] as { _?: string } | string | undefined
      const uuid =
        na0 != null && typeof na0 === "object" && "_" in na0 ? String(na0._) : na0 != null ? String(na0) : ""

      const summarizedItems: FelXmlLine[] = []
      if (Array.isArray(items)) {
        for (const item of items) {
          const wrap = item as Record<string, unknown>
          const itemArr = wrap["dte:Item"] as unknown[] | undefined
          if (!Array.isArray(itemArr) || !itemArr[0]) continue
          const row = itemArr[0] as Record<string, unknown>
          const attrs = row.$ as Record<string, string> | undefined
          const desc = row["dte:Descripcion"] as unknown[] | undefined
          const d0 = desc?.[0]
          summarizedItems.push({
            bienOServicio: attrs?.BienOServicio ?? "?",
            descripcion: typeof d0 === "string" ? d0.trim() : String(d0 ?? "").trim(),
          })
        }
      }

      if (uuid) converted.push({ uuid, items: summarizedItems })
    } catch (e) {
      console.warn("[fetchFelZipXmlLines] XML omitido:", filename, (e as Error).message)
    }
  }

  opts?.onCheckpoint?.("done", `xml_docs=${converted.length}`)
  return converted
}
