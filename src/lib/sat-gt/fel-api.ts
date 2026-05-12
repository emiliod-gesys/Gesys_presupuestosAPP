import axios, { type AxiosError } from "axios"
import JSZip from "jszip"
import { parseStringPromise } from "xml2js"
import {
  felMessageFromResponse,
  getConsultaDtePagedSlice,
  getFelDteUuid,
  isFelCodigoClientError,
  unwrapFelConsultaResponse,
} from "./fel-rows"

/** Algunas despliegues del SAT esperan dd/MM/yyyy en el query en lugar de ISO. */
export function isoDateToDdMmYyyy(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim())
  if (!m) return iso.trim()
  return `${m[3]}/${m[2]}/${m[1]}`
}

export type FelConsultaDateFormat = "iso" | "ddmmyyyy"

export type FelConsultaDteOpts = {
  dateFormat?: FelConsultaDateFormat
  /** Paginación (portal FEL): suele ir con `tamanoPagina`. */
  pagina?: number
  tamanoPagina?: number
  onCheckpoint?: (stage: string, detail?: string) => void
  /**
   * NIT del perfil (solo dígitos): en `tipoOperacion=R` se envía en `nitIdReceptor` salvo `SAT_FEL_OMIT_NIT_RECEPTOR=1`.
   * Si no hay valor aquí y `SAT_FEL_NIT_RECEPTOR_QUERY=1`, se usa el `usuario=` (legacy).
   */
  nitReceptorQueryValue?: string
}

/** Valor de `nitIdReceptor` en consulta-dte / zip-xml para operación R. */
export function felNitIdReceptorQueryParam(
  operationType: "E" | "R",
  usuario: string,
  nitReceptorQueryValue?: string
): string {
  if (operationType !== "R" || process.env.SAT_FEL_OMIT_NIT_RECEPTOR === "1") return ""
  const explicit = nitReceptorQueryValue?.trim() ?? ""
  if (explicit !== "") return encodeURIComponent(explicit)
  if (process.env.SAT_FEL_NIT_RECEPTOR_QUERY === "1") {
    const u = usuario.trim()
    if (u !== "") return encodeURIComponent(u)
  }
  return ""
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
  const fmt = opts?.dateFormat ?? "iso"
  const s = fmt === "ddmmyyyy" ? isoDateToDdMmYyyy(startDate) : startDate
  const e = fmt === "ddmmyyyy" ? isoDateToDdMmYyyy(endDate) : endDate
  const nitReceptor = felNitIdReceptorQueryParam(operationType, user, opts?.nitReceptorQueryValue)
  let url =
    `https://felcons.c.sat.gob.gt/dte-agencia-virtual/api/consulta-dte?usuario=${encodeURIComponent(user)}` +
    `&tipoOperacion=${operationType}&establecimiento=&tipoDte=&noAutorizacion=&nitIdReceptor=${nitReceptor}&estadoDte=&serie=&numero=&moneda=&montoTotalRangoIni=&montoTotalRangoFinal=&impuesto=&nitCertificador=&resultado=&fechaEmisionIni=${encodeURIComponent(s)}&fechaEmisionFinal=${encodeURIComponent(e)}`
  if (opts?.pagina != null && opts.pagina > 0) {
    url += `&pagina=${encodeURIComponent(String(opts.pagina))}`
  }
  if (opts?.tamanoPagina != null && opts.tamanoPagina > 0) {
    url += `&tamanoPagina=${encodeURIComponent(String(opts.tamanoPagina))}`
  }

  try {
    /** Cabeceras mínimas como `reference/moore-rpa-main/src/api.ts` (sin Accept). */
    const response = await axios.get(url, {
      headers: {
        Authorization: token.trim(),
        Cookie: cookieHeader,
      },
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
  /** Trazas internas (fusión de páginas); no incluir datos sensibles en `detail`. */
  onCheckpoint?: (stage: string, detail?: string) => void
  nitReceptorQueryValue?: string
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
    return fetchFelConsultaDte(token, cookieHeader, user, startDate, endDate, operationType, {
      dateFormat: fmt,
      ...(nitRv ? { nitReceptorQueryValue: nitRv } : {}),
      ...extra,
    })
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
  const nitReceptorZip = felNitIdReceptorQueryParam(operationType, user, opts?.nitReceptorQueryValue)
  const url =
    `https://felcons.c.sat.gob.gt/dte-agencia-virtual/api/consulta-dte/zip-xml?usuario=${encodeURIComponent(user)}` +
    `&tipoOperacion=${operationType}&establecimiento=0&tipoDte=TDS&noAutorizacion=&nitIdReceptor=${nitReceptorZip}&estadoDte=TDS&serie=&numero=&moneda=TDS&montoTotalRangoIni=&montoTotalRangoFinal=&impuesto=&nitCertificador=&resultado=&fechaEmisionIni=${encodeURIComponent(s)}&fechaEmisionFinal=${encodeURIComponent(e)}`

  const response = await axios.post<ArrayBuffer>(url, bodyRows, {
    headers: {
      Authorization: token.trim(),
      Cookie: cookieHeader,
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
