import type { Browser, Page } from "puppeteer-core"
import { fetchFelConsultaDte, fetchFelZipXmlLines, type FelXmlConverted } from "./fel-api"
import { extractConsultaDteList, normalizeSatDteRecord } from "./fel-rows"
import type { SatDteListRow } from "./fel-types"

/**
 * Entornos cloud (Vercel, Lambda, etc.) suelen usar HOME tipo /home/sbx_user… sin caché de Puppeteer.
 * No confiar solo en VERCEL==="1" (a veces falta o difiere); @sparticuz/chromium + puppeteer-core evitan el error
 * "Could not find Chrome".
 */
function shouldUsePackagedChromium(): boolean {
  if (process.env.SAT_PACKAGED_CHROMIUM === "0") return false
  if (process.env.SAT_PACKAGED_CHROMIUM === "1") return true
  // Usuario fuerza Chrome del sistema (evita binario empaquetado)
  if (process.env.PUPPETEER_EXECUTABLE_PATH?.trim()) return false

  if (process.env.VERCEL) return true
  if (process.env.AWS_EXECUTION_ENV) return true
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) return true
  if (process.env.LAMBDA_TASK_ROOT) return true

  const home = process.env.HOME ?? ""
  if (/sbx_user/i.test(home)) return true

  return false
}

/** API mínima de @sparticuz/chromium (los .d.ts no siempre exponen default + CJS bien). */
type SparticuzChromium = {
  args: string[]
  defaultViewport: import("puppeteer-core").Viewport | null
  executablePath: () => Promise<string>
  headless: boolean | "shell" | "new"
  setGraphicsMode?: (enabled: boolean) => void
}

/** Chromium empaquetado en serverless; local: Puppeteer con Chrome descargado por postinstall. */
async function launchSatBrowser(headless: boolean): Promise<Browser> {
  if (shouldUsePackagedChromium()) {
    const puppeteerCore = await import("puppeteer-core")
    const chromiumMod = await import("@sparticuz/chromium")
    const chromium = (chromiumMod.default ?? chromiumMod) as unknown as SparticuzChromium
    chromium.setGraphicsMode?.(false)
    const executablePath = await chromium.executablePath()
    return puppeteerCore.default.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: headless ? chromium.headless : false,
    })
  }

  const puppeteer = await import("puppeteer")
  const execPath = process.env.PUPPETEER_EXECUTABLE_PATH?.trim()
  return puppeteer.default.launch({
    headless,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    ...(execPath ? { executablePath: execPath } : {}),
  })
}

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
 * En Vercel/Lambda usa @sparticuz/chromium + puppeteer-core; en local usa el paquete puppeteer
 * (Chrome descargado por postinstall / npx puppeteer browsers install chrome).
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
  let browser: Browser | null = await launchSatBrowser(headless)

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
