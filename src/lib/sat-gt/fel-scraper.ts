import type { Browser, Page } from "puppeteer"
import puppeteer from "puppeteer"
import { fetchFelConsultaDte, fetchFelZipXmlLines, type FelXmlConverted } from "./fel-api"
import { extractConsultaDteList, normalizeSatDteRecord } from "./fel-rows"
import type { SatDteListRow } from "./fel-types"

async function getAccessTokenCookie(page: Page, timeoutMs: number) {
  const startedAt = Date.now()
  const origins = [
    "https://felcons.c.sat.gob.gt",
    "https://felcons.c.sat.gob.gt/dte-agencia-virtual/dte-consulta",
    "https://farm3.sat.gob.gt",
  ]

  while (Date.now() - startedAt < timeoutMs) {
    const cookies = await page.cookies(...origins)
    const accessTokenCookie = cookies.find((c) => c.name === "ACCESS_TOKEN")
    if (accessTokenCookie) return { accessTokenCookie, cookies }
    await new Promise((r) => setTimeout(r, 500))
  }

  const cookies = await page.cookies(...origins)
  return { accessTokenCookie: cookies.find((c) => c.name === "ACCESS_TOKEN") ?? null, cookies }
}

function buildCookieHeader(cookies: { name: string; value: string }[]): string {
  const prioritized = ["ACCESS_TOKEN", "JSESSIONID"]
  const sorted = [...cookies].sort((left, right) => {
    const lp = prioritized.indexOf(left.name)
    const rp = prioritized.indexOf(right.name)
    const nl = lp === -1 ? prioritized.length : lp
    const nr = rp === -1 ? prioritized.length : rp
    if (nl !== nr) return nl - nr
    return left.name.localeCompare(right.name)
  })
  return sorted.map((c) => `${c.name}=${c.value}`).join("; ")
}

function attachLineSummaries(rows: Record<string, unknown>[], xmlRows: FelXmlConverted[]) {
  for (const row of rows) {
    const u = String(row.numeroUuid ?? row.numeroUUID ?? row.uuid ?? "").trim()
    if (!u) continue
    const hit = xmlRows.find((x) => x.uuid === u)
    if (hit?.items?.length) {
      ;(row as { _lineSummary?: string })._lineSummary = hit.items.map((i) => i.descripcion).join(" · ").slice(0, 240)
    }
  }
}

/**
 * Inicia sesión en farm3.sat.gob.gt, abre Consultar DTE y obtiene token/cookies para felcons.
 * Usa Puppeteer estándar (sin puppeteer-extra/stealth) para evitar dependencias transitivas
 * que el file tracing de Vercel no empaqueta bien (p. ej. is-plain-object vía merge-deep).
 * Requiere Node con Chromium; en serverless puede fallar por tamaño o políticas del host.
 */
export async function runSatFelExtraction(opts: {
  portalLogin: string
  portalPassword: string
  dateFrom: string
  dateTo: string
}): Promise<{ rows: SatDteListRow[]; warnings: string[] }> {
  const warnings: string[] = []
  const username = opts.portalLogin.trim()
  const password = opts.portalPassword
  if (!username || !password) throw new Error("Faltan usuario o contraseña del portal SAT.")

  const headless = process.env.SAT_PUPPETEER_HEADLESS?.toLowerCase() !== "false"
  let browser: Browser | null = await puppeteer.launch({
    headless,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  })

  let token: string
  let cookieHeader: string

  try {
    const page = await browser.newPage()
    page.setDefaultTimeout(60000)
    await page.goto("https://farm3.sat.gob.gt/menu/login.jsf", { waitUntil: "domcontentloaded" })

    await page.waitForSelector("#formContent\\:username", { visible: true })
    await page.type("#formContent\\:username", username, { delay: 15 })
    await new Promise((r) => setTimeout(r, 600))
    await page.type("#formContent\\:password", password, { delay: 15 })
    await page.click("#formContent\\:cmdbtnIngresar")
    await new Promise((r) => setTimeout(r, 1200))

    const errorMessage = await page.$("#formContent\\:otMensaje").catch(() => null)
    if (errorMessage) {
      const errorMessageText = await page.evaluate((el) => el.textContent, errorMessage)
      if (errorMessageText?.trim()) throw new Error("Invalid credentials")
    }

    await new Promise((r) => setTimeout(r, 4000))
    await page.waitForSelector("#btnContraerMenu", { visible: true, timeout: 45000 })
    await page.click("#btnContraerMenu")
    await new Promise((r) => setTimeout(r, 400))
    await page.locator("text/Servicios Tributarios").hover()
    await new Promise((r) => setTimeout(r, 500))
    await page.locator("text/Factura Electrónica en Línea (FEL)").hover()
    await new Promise((r) => setTimeout(r, 500))
    await page.locator("text/Consultar DTE").click()
    await new Promise((r) => setTimeout(r, 1000))
    await page.goto("https://felcons.c.sat.gob.gt/dte-agencia-virtual/dte-consulta", {
      waitUntil: "domcontentloaded",
    })

    const { accessTokenCookie, cookies } = await getAccessTokenCookie(page, 25000)
    if (!accessTokenCookie?.value) {
      throw new Error(
        "No se obtuvo ACCESS_TOKEN del portal SAT. Comprueba credenciales o vuelve a intentar; el portal puede haber cambiado."
      )
    }
    token = accessTokenCookie.value
    cookieHeader = buildCookieHeader(cookies)

    await browser.close()
    browser = null
  } catch (e) {
    if (browser) {
      await browser.close().catch(() => {})
      browser = null
    }
    throw e
  }

  const preSales = await fetchFelConsultaDte(token, cookieHeader, username, opts.dateFrom, opts.dateTo, "E")
  const prePurchases = await fetchFelConsultaDte(token, cookieHeader, username, opts.dateFrom, opts.dateTo, "R")

  const salesList = extractConsultaDteList(preSales)
  const purchaseList = extractConsultaDteList(prePurchases)

  let xmlSales: FelXmlConverted[] = []
  let xmlPurchases: FelXmlConverted[] = []
  try {
    xmlSales = await fetchFelZipXmlLines(token, cookieHeader, username, opts.dateFrom, opts.dateTo, "E", salesList)
  } catch (e) {
    warnings.push(`No se pudieron cargar líneas de detalle (emitidos): ${(e as Error).message}`)
  }
  try {
    xmlPurchases = await fetchFelZipXmlLines(
      token,
      cookieHeader,
      username,
      opts.dateFrom,
      opts.dateTo,
      "R",
      purchaseList
    )
  } catch (e) {
    warnings.push(`No se pudieron cargar líneas de detalle (recibidos): ${(e as Error).message}`)
  }

  attachLineSummaries(salesList, xmlSales)
  attachLineSummaries(purchaseList, xmlPurchases)

  const rows: SatDteListRow[] = []
  for (const raw of salesList) {
    const ls = (raw as { _lineSummary?: string })._lineSummary ?? null
    const n = normalizeSatDteRecord(raw, "E", ls)
    if (n) rows.push(n)
  }
  for (const raw of purchaseList) {
    const ls = (raw as { _lineSummary?: string })._lineSummary ?? null
    const n = normalizeSatDteRecord(raw, "R", ls)
    if (n) rows.push(n)
  }

  rows.sort((a, b) => {
    const da = a.date ?? ""
    const db = b.date ?? ""
    if (da !== db) return db.localeCompare(da)
    return a.uuid.localeCompare(b.uuid)
  })

  return { rows, warnings }
}

export function formatSatFelUserError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg === "Invalid credentials") return "Credenciales del portal SAT incorrectas. Revísalas en Mi perfil."
  return msg || "Error al consultar el SAT."
}
