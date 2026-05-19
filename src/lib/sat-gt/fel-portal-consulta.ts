import type { HTTPResponse, Page } from "puppeteer-core"
import { isoToDdMmYyyyDisplay } from "./dates"
import { extractConsultaDteList } from "./fel-rows"

/** Dispara la consulta en la SPA felcons y captura la respuesta JSON de consulta-dte. */
export async function captureConsultaDteViaPortalUi(
  page: Page,
  operationType: "E" | "R",
  dateFromIso: string,
  dateToIso: string,
  onCheckpoint?: (stage: string, detail?: string) => void
): Promise<unknown | null> {
  const fromDisplay = isoToDdMmYyyyDisplay(dateFromIso)
  const toDisplay = isoToDdMmYyyyDisplay(dateToIso)
  if (!fromDisplay || !toDisplay) return null

  const matchOp = (url: string) =>
    url.includes("/api/consulta-dte") &&
    !url.includes("zip-xml") &&
    url.includes(`tipoOperacion=${operationType}`)

  const responsePromise = page
    .waitForResponse((res) => matchOp(res.url()) && res.status() === 200, { timeout: 90000 })
    .catch(() => null)

  onCheckpoint?.("portal_ui_trigger_start", `${operationType} ${fromDisplay}..${toDisplay}`)

  const currentUrl = page.url()
  if (!currentUrl.includes("dte-consulta")) {
    await page
      .goto("https://felcons.c.sat.gob.gt/dte-agencia-virtual/dte-consulta", {
        waitUntil: "networkidle2",
        timeout: 60000,
      })
      .catch(() => {})
    await new Promise((r) => setTimeout(r, 1500))
  }

  const clicked = await page.evaluate(
    (op, from, to) => {
      const clickText = (needles: string[]) => {
        const nodes = document.querySelectorAll(
          "button, a, [role='tab'], .ui-menuitem-text, label, span, div, p, li"
        )
        for (const node of nodes) {
          const t = (node.textContent || "").replace(/\s+/g, " ").trim()
          if (!t) continue
          const lower = t.toLowerCase()
          if (!needles.some((n) => lower.includes(n))) continue
          ;(node as HTMLElement).click()
          return true
        }
        return false
      }

      if (op === "R") {
        clickText(["recibid", "compras", "receptor"])
      } else {
        clickText(["emitid", "ventas", "emisor"])
      }

      const inputs = Array.from(document.querySelectorAll("input")) as HTMLInputElement[]
      const dateInputs = inputs.filter(
        (i) =>
          i.type === "date" ||
          /fecha|date/i.test(i.name || "") ||
          /fecha|date/i.test(i.id || "") ||
          /fecha|date/i.test(i.placeholder || "")
      )
      const textInputs = inputs.filter((i) => i.type === "text" || i.type === "")

      const setVal = (el: HTMLInputElement, v: string) => {
        el.focus()
        el.value = v
        el.dispatchEvent(new Event("input", { bubbles: true }))
        el.dispatchEvent(new Event("change", { bubbles: true }))
      }

      if (dateInputs.length >= 2) {
        setVal(dateInputs[0], from)
        setVal(dateInputs[1], to)
      } else if (textInputs.length >= 2) {
        setVal(textInputs[0], from)
        setVal(textInputs[1], to)
      }

      return clickText(["consultar", "buscar", "filtrar", "aplicar", "generar"])
    },
    operationType,
    fromDisplay,
    toDisplay
  )

  onCheckpoint?.("portal_ui_trigger_done", `clicked=${clicked}`)

  const response: HTTPResponse | null = await responsePromise
  if (!response) {
    onCheckpoint?.("portal_ui_no_response", "")
    return null
  }

  try {
    const json = (await response.json()) as unknown
    const rows = extractConsultaDteList(json).length
    onCheckpoint?.("portal_ui_response", `rows=${rows}`)
    return json
  } catch (e) {
    onCheckpoint?.("portal_ui_json_error", (e as Error).message?.slice(0, 120))
    return null
  }
}
