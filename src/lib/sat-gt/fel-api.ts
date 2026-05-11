import axios, { type AxiosError } from "axios"
import JSZip from "jszip"
import { parseStringPromise } from "xml2js"

/** Algunas despliegues del SAT esperan dd/MM/yyyy en el query en lugar de ISO. */
export function isoDateToDdMmYyyy(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim())
  if (!m) return iso.trim()
  return `${m[3]}/${m[2]}/${m[1]}`
}

export type FelConsultaDateFormat = "iso" | "ddmmyyyy"

export async function fetchFelConsultaDte(
  token: string,
  cookieHeader: string,
  user: string,
  startDate: string,
  endDate: string,
  operationType: "E" | "R",
  opts?: { dateFormat?: FelConsultaDateFormat }
): Promise<unknown> {
  const fmt = opts?.dateFormat ?? "iso"
  const s = fmt === "ddmmyyyy" ? isoDateToDdMmYyyy(startDate) : startDate
  const e = fmt === "ddmmyyyy" ? isoDateToDdMmYyyy(endDate) : endDate
  const url =
    `https://felcons.c.sat.gob.gt/dte-agencia-virtual/api/consulta-dte?usuario=${encodeURIComponent(user)}` +
    `&tipoOperacion=${operationType}&establecimiento=&tipoDte=&noAutorizacion=&nitIdReceptor=&estadoDte=&serie=&numero=&moneda=&montoTotalRangoIni=&montoTotalRangoFinal=&impuesto=&nitCertificador=&resultado=&fechaEmisionIni=${encodeURIComponent(s)}&fechaEmisionFinal=${encodeURIComponent(e)}`

  try {
    const response = await axios.get(url, {
      headers: {
        Authorization: token.trim(),
        Cookie: cookieHeader,
        Accept: "application/json",
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
  opts?: { dateFormat?: FelConsultaDateFormat }
): Promise<FelXmlConverted[]> {
  if (!Array.isArray(bodyRows) || bodyRows.length === 0) return []

  const fmt = opts?.dateFormat ?? "iso"
  const s = fmt === "ddmmyyyy" ? isoDateToDdMmYyyy(startDate) : startDate
  const e = fmt === "ddmmyyyy" ? isoDateToDdMmYyyy(endDate) : endDate
  const url =
    `https://felcons.c.sat.gob.gt/dte-agencia-virtual/api/consulta-dte/zip-xml?usuario=${encodeURIComponent(user)}` +
    `&tipoOperacion=${operationType}&establecimiento=0&tipoDte=TDS&noAutorizacion=&nitIdReceptor=&estadoDte=TDS&serie=&numero=&moneda=TDS&montoTotalRangoIni=&montoTotalRangoFinal=&impuesto=&nitCertificador=&resultado=&fechaEmisionIni=${encodeURIComponent(s)}&fechaEmisionFinal=${encodeURIComponent(e)}`

  const response = await axios.post<ArrayBuffer>(url, bodyRows, {
    headers: {
      Authorization: token.trim(),
      Cookie: cookieHeader,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    responseType: "arraybuffer",
  })

  const zip = await JSZip.loadAsync(response.data)
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

  return converted
}
