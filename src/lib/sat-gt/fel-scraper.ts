import type { Browser, Page } from "puppeteer-core"
import {
  fetchFelConsultaDteMergedPages,
  fetchFelZipXmlLines,
  type FelConsultaDateFormat,
  type FelXmlConverted,
} from "./fel-api"
import {
  countNormalizedRows,
  describeFelResponseShape,
  extractConsultaDteList,
  felMessageFromResponse,
  getConsultaDtePagedSlice,
  isFelCodigoClientError,
  normalizeSatDteRecord,
} from "./fel-rows"
import type { SatDteListRow, SatFelCheckpoint, SatFelRunDiagnostics } from "./fel-types"

/**
 * Flujo felcons alineado con `reference/moore-rpa-main` (login farm3 → `usuario=` en consulta-dte).
 *
 * Entornos cloud (Vercel, Lambda, etc.) suelen usar HOME tipo /home/sbx_user… sin caché de Puppeteer.
 * No confiar solo en VERCEL==="1" (a veces falta o difiere); @sparticuz/chromium + puppeteer-core evitan el error
 * "Could not find Chrome".
 */
export function shouldUsePackagedChromium(): boolean {
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

/** puppeteer-core (esta versión) no admite headless: "new"; @sparticuz/chromium a veces lo devuelve. */
function headlessForPuppeteerCore(
  wantHeadless: boolean,
  chromiumHeadless: boolean | "shell" | "new"
): boolean | "shell" | undefined {
  if (!wantHeadless) return false
  if (chromiumHeadless === "new") return true
  if (chromiumHeadless === false) return true
  return chromiumHeadless
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
      headless: headlessForPuppeteerCore(headless, chromium.headless),
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
  /** Usuario con el que se abre farm3 (correo o NIT). */
  portalLogin: string
  /**
   * Reserva para `usuario=` si no hay `portalLogin` (caso raro).
   * Por defecto usamos **portalLogin** en la API, igual que `reference/moore-rpa-main` (`username` en fetchDataFromAPI).
   */
  felConsultaUsuario: string
  /** NIT normalizado del perfil (solo diagnóstico; no sustituye al login en `usuario=`). */
  profileNit?: string | null
  portalPassword: string
  dateFrom: string
  dateTo: string
}): Promise<{ rows: SatDteListRow[]; warnings: string[]; diagnostics: SatFelRunDiagnostics }> {
  const warnings: string[] = []
  const runStarted = Date.now()
  const checkpoints: SatFelCheckpoint[] = []
  const cp = (stage: string, detail?: string) => {
    const row: SatFelCheckpoint = { stage, atMs: Date.now() - runStarted }
    if (detail != null && detail !== "") row.detail = detail
    checkpoints.push(row)
  }

  cp("sat.run_start", `range=${opts.dateFrom}..${opts.dateTo}`)
  const username = opts.portalLogin.trim()
  /** Igual que moore-rpa `routes.ts` → `fetchDataFromAPI(..., username, ...)`: `usuario=` = login del portal. */
  const apiUsuario = username || opts.felConsultaUsuario.trim()
  const password = opts.portalPassword
  if (!username || !password) throw new Error("Faltan usuario o contraseña del portal SAT.")
  if (!apiUsuario) throw new Error("Falta usuario para consultar DTE en la API del SAT.")

  const headless = process.env.SAT_PUPPETEER_HEADLESS?.toLowerCase() !== "false"
  cp("sat.browser_launch", `headless=${headless} chromium=${shouldUsePackagedChromium() ? "packaged" : "local"}`)
  let browser: Browser | null = await launchSatBrowser(headless)
  cp("sat.browser_ready")

  let token: string
  let cookieHeader: string

  try {
    const page = await browser.newPage()
    cp("sat.page_new")
    page.setDefaultTimeout(60000)
    await page.goto("https://farm3.sat.gob.gt/menu/login.jsf", { waitUntil: "domcontentloaded" })
    cp("sat.farm3_login_loaded")

    await page.waitForSelector("#formContent\\:username", { visible: true })
    await page.type("#formContent\\:username", username, { delay: 15 })
    await new Promise((r) => setTimeout(r, 600))
    await page.type("#formContent\\:password", password, { delay: 15 })
    await page.click("#formContent\\:cmdbtnIngresar")
    await new Promise((r) => setTimeout(r, 1200))
    cp("sat.credentials_submitted")

    const errorMessage = await page.$("#formContent\\:otMensaje").catch(() => null)
    if (errorMessage) {
      const errorMessageText = await page.evaluate((el) => el.textContent, errorMessage)
      if (errorMessageText?.trim()) throw new Error("Invalid credentials")
    }

    await new Promise((r) => setTimeout(r, 4000))
    await page.waitForSelector("#btnContraerMenu", { visible: true, timeout: 45000 })
    cp("sat.post_login_menu_visible")
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
    cp("sat.felcons_consulta_page")

    const { accessTokenCookie, cookies } = await getAccessTokenCookie(page, 25000)
    if (!accessTokenCookie?.value) {
      throw new Error(
        "No se obtuvo ACCESS_TOKEN del portal SAT. Comprueba credenciales o vuelve a intentar; el portal puede haber cambiado."
      )
    }
    token = accessTokenCookie.value
    cookieHeader = buildCookieHeader(cookies)
    cp("sat.access_token_ready", `cookies=${cookies.length}`)

    await browser.close()
    browser = null
  } catch (e) {
    if (browser) {
      await browser.close().catch(() => {})
      browser = null
    }
    cp("sat.browser_phase_error", (e as Error).message?.slice(0, 200) ?? "unknown")
    throw e
  }

  const mergeCp =
    (op: "E" | "R") =>
    (stage: string, detail?: string) => {
      cp(`sat.merge_${op === "E" ? "emitidos" : "recibidos"}.${stage}`, detail)
    }

  const nitForReceptor = opts.profileNit?.trim() || undefined

  let dateFormatUsed: FelConsultaDateFormat = "iso"
  cp("sat.api_consulta_emitidos_start")
  const preSalesIso = await fetchFelConsultaDteMergedPages(
    token,
    cookieHeader,
    apiUsuario,
    opts.dateFrom,
    opts.dateTo,
    "E",
    { dateFormat: "iso", onCheckpoint: mergeCp("E"), nitReceptorQueryValue: nitForReceptor }
  )
  cp("sat.api_consulta_recibidos_start")
  const prePurchasesIso = await fetchFelConsultaDteMergedPages(
    token,
    cookieHeader,
    apiUsuario,
    opts.dateFrom,
    opts.dateTo,
    "R",
    { dateFormat: "iso", onCheckpoint: mergeCp("R"), nitReceptorQueryValue: nitForReceptor }
  )

  let preSales = preSalesIso
  let prePurchases = prePurchasesIso
  let salesList = extractConsultaDteList(preSales)
  let purchaseList = extractConsultaDteList(prePurchases)
  cp(
    "sat.extract_lists_iso",
    `emitidos_raw=${salesList.length} recibidos_raw=${purchaseList.length}`
  )

  if (
    process.env.SAT_FEL_TRY_DDMM === "1" &&
    salesList.length === 0 &&
    purchaseList.length === 0
  ) {
    cp("sat.retry_ddmm_start")
    const preSalesDd = await fetchFelConsultaDteMergedPages(
      token,
      cookieHeader,
      apiUsuario,
      opts.dateFrom,
      opts.dateTo,
      "E",
      { dateFormat: "ddmmyyyy", onCheckpoint: mergeCp("E"), nitReceptorQueryValue: nitForReceptor }
    )
    const prePurchasesDd = await fetchFelConsultaDteMergedPages(
      token,
      cookieHeader,
      apiUsuario,
      opts.dateFrom,
      opts.dateTo,
      "R",
      { dateFormat: "ddmmyyyy", onCheckpoint: mergeCp("R"), nitReceptorQueryValue: nitForReceptor }
    )
    const codeE = felMessageFromResponse(preSalesDd).codigo
    const codeR = felMessageFromResponse(prePurchasesDd).codigo
    const salesDd = extractConsultaDteList(preSalesDd)
    const purchaseDd = extractConsultaDteList(prePurchasesDd)
    const ddOk =
      !isFelCodigoClientError(codeE) &&
      !isFelCodigoClientError(codeR) &&
      salesDd.length + purchaseDd.length > 0

    if (ddOk) {
      dateFormatUsed = "ddmmyyyy"
      preSales = preSalesDd
      prePurchases = prePurchasesDd
      salesList = salesDd
      purchaseList = purchaseDd
      cp("sat.retry_ddmm_ok", `emitidos_raw=${salesList.length} recibidos_raw=${purchaseList.length}`)
      warnings.push(
        "SAT_FEL_TRY_DDMM=1: se usaron fechas dd/MM/yyyy en la URL y hubo filas. Si no lo necesitas, quita la variable de entorno."
      )
    } else {
      cp("sat.retry_ddmm_skip", "sin filas o error cliente en reintento dd/MM")
    }
  }

  const msgE = felMessageFromResponse(preSales)
  const msgR = felMessageFromResponse(prePurchases)

  let xmlSales: FelXmlConverted[] = []
  let xmlPurchases: FelXmlConverted[] = []
  try {
    cp("sat.zip_xml_emitidos_start", `body_rows=${salesList.length}`)
    xmlSales = await fetchFelZipXmlLines(
      token,
      cookieHeader,
      apiUsuario,
      opts.dateFrom,
      opts.dateTo,
      "E",
      salesList,
      {
        dateFormat: dateFormatUsed,
        onCheckpoint: (stage, detail) => cp(`sat.zip_emitidos.${stage}`, detail),
        nitReceptorQueryValue: nitForReceptor,
      }
    )
    cp("sat.zip_xml_emitidos_done", `xml_docs=${xmlSales.length}`)
  } catch (e) {
    cp("sat.zip_xml_emitidos_error", (e as Error).message?.slice(0, 160) ?? "error")
    warnings.push(`No se pudieron cargar líneas de detalle (emitidos): ${(e as Error).message}`)
  }
  try {
    cp("sat.zip_xml_recibidos_start", `body_rows=${purchaseList.length}`)
    xmlPurchases = await fetchFelZipXmlLines(
      token,
      cookieHeader,
      apiUsuario,
      opts.dateFrom,
      opts.dateTo,
      "R",
      purchaseList,
      {
        dateFormat: dateFormatUsed,
        onCheckpoint: (stage, detail) => cp(`sat.zip_recibidos.${stage}`, detail),
        nitReceptorQueryValue: nitForReceptor,
      }
    )
    cp("sat.zip_xml_recibidos_done", `xml_docs=${xmlPurchases.length}`)
  } catch (e) {
    cp("sat.zip_xml_recibidos_error", (e as Error).message?.slice(0, 160) ?? "error")
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
  cp(
    "sat.normalize_done",
    `rows_ui=${rows.length} raw_emitidos=${salesList.length} raw_recibidos=${purchaseList.length}`
  )

  const normE = countNormalizedRows(salesList, "E")
  const normR = countNormalizedRows(purchaseList, "R")

  if (salesList.length > 0 && normE === 0) {
    warnings.push(
      "Emitidos: el SAT devolvió registros pero no pudimos leer UUID/monto (formato distinto). Revisa el NIT en tu perfil y el rango de fechas."
    )
  }
  if (purchaseList.length > 0 && normR === 0) {
    warnings.push(
      "Recibidos (compras): el SAT devolvió registros pero no pudimos leer UUID/monto. Comprueba que el NIT del perfil sea el del contribuyente y amplía el rango de fechas si hace falta."
    )
  }
  const hintE = describeFelResponseShape(preSales)
  const hintR = describeFelResponseShape(prePurchases)
  const sliceDiagE = getConsultaDtePagedSlice(preSales)
  const sliceDiagR = getConsultaDtePagedSlice(prePurchases)

  const utcToday = new Date().toISOString().slice(0, 10)
  const dateToAfterUtcToday = opts.dateTo > utcToday

  if (salesList.length === 0 && purchaseList.length === 0) {
    if (dateToAfterUtcToday) {
      warnings.push(
        `La fecha «hasta» de la consulta (${opts.dateTo}) es posterior al día UTC de hoy (${utcToday}). El SAT no devuelve documentos con fecha de emisión futura; es normal ver total=0 y lista vacía. Pon «hasta» en el último día con facturas o en hoy.`
      )
    }
    if (msgE.mensaje || msgR.mensaje) {
      warnings.push(
        `SAT: ${[msgE.mensaje, msgR.mensaje].filter(Boolean).join(" · ") || "Sin detalle en la respuesta."}`
      )
    } else {
      warnings.push(
        "No hay DTE en el rango indicado para el usuario de la consulta (emitidos ni recibidos). Prueba otras fechas o confirma en el portal FEL (Consultar DTE) con el mismo usuario y rango."
      )
    }
    if (
      !dateToAfterUtcToday &&
      sliceDiagE.totalReported === 0 &&
      sliceDiagR.totalReported === 0 &&
      (msgE.codigo?.toUpperCase().includes("ACCEPT") || msgR.codigo?.toUpperCase().includes("ACCEPT"))
    ) {
      warnings.push(
        "El SAT respondió ACCEPTED con total=0 en emitidos y recibidos: no hay documentos en ese intervalo para el parámetro usuario= de la consulta. Verifica el mismo rango en el portal FEL; si ahí sí hay compras y aquí no, prueba SAT_FEL_NIT_RECEPTOR_QUERY=1 en el servidor (nitIdReceptor con el NIT del perfil)."
      )
    }
    if (hintE.maxArrayLengthSeen > 0 || hintR.maxArrayLengthSeen > 0) {
      warnings.push(
        `La respuesta JSON sí contiene arrays (máx. ${Math.max(hintE.maxArrayLengthSeen, hintR.maxArrayLengthSeen)} elementos), pero no reconocimos filas tipo DTE. Revisa el diagnóstico de forma de respuesta abajo o avísanos para ajustar el parseo al formato actual del SAT.`
      )
    }
  }

  cp("sat.run_complete", `rows=${rows.length}`)
  const diagnostics: SatFelRunDiagnostics = {
    felConsultaUsuario: apiUsuario,
    felNitPerfil: opts.profileNit?.trim() || null,
    felDateFormatUsed: dateFormatUsed,
    queryWindow: {
      dateFrom: opts.dateFrom,
      dateTo: opts.dateTo,
      utcToday,
      dateToAfterUtcToday,
    },
    responseHints: { emitidos: hintE, recibidos: hintR },
    checkpoints,
    emitidos: {
      rawListLength: salesList.length,
      normalizedCount: normE,
      codigo: msgE.codigo,
      mensaje: msgE.mensaje,
      satTotalRegistros: sliceDiagE.totalReported,
      satTotalPagina: sliceDiagE.totalPaginaReported,
    },
    recibidos: {
      rawListLength: purchaseList.length,
      normalizedCount: normR,
      codigo: msgR.codigo,
      mensaje: msgR.mensaje,
      satTotalRegistros: sliceDiagR.totalReported,
      satTotalPagina: sliceDiagR.totalPaginaReported,
    },
  }

  return { rows, warnings, diagnostics }
}

export function formatSatFelUserError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg === "Invalid credentials") return "Credenciales del portal SAT incorrectas. Revísalas en Mi perfil."
  return msg || "Error al consultar el SAT."
}
