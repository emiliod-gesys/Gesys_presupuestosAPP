import type { HTTPResponse, Page } from "puppeteer-core"
import { extractConsultaDteList } from "./fel-rows"
import { isoToDdMmYyyyDisplay } from "./dates"

export type FelPortalSniffHit = {
  operationType: "E" | "R" | "?"
  /** URL completa para reintento (no incluir en UI). */
  url: string
  urlRedacted: string
  rowCount: number
  totalReported: number
  json: unknown
}

function redactConsultaUrl(url: string): string {
  try {
    const u = new URL(url)
    if (u.searchParams.has("Authorization")) u.searchParams.delete("Authorization")
    return `${u.pathname}?${u.searchParams.toString()}`.slice(0, 480)
  } catch {
    return url.replace(/ACCESS_TOKEN=[^&]+/gi, "ACCESS_TOKEN=*").slice(0, 480)
  }
}

function opFromUrl(url: string): "E" | "R" | "?" {
  const m = url.match(/tipoOperacion=(E|R)/i)
  if (m?.[1] === "E" || m?.[1] === "R") return m[1]
  return "?"
}

function totalFromJson(json: unknown): number {
  if (!json || typeof json !== "object") return 0
  const det = (json as { detalle?: { total?: unknown } }).detalle
  const t = det?.total
  if (typeof t === "number" && Number.isFinite(t)) return Math.trunc(t)
  if (t != null) {
    const n = parseInt(String(t).replace(/[^\d]/g, "") || "0", 10)
    return Number.isFinite(n) ? n : 0
  }
  return extractConsultaDteList(json).length
}

/** Escucha respuestas consulta-dte mientras la SPA felcons navega o consulta. */
export function attachFelconsConsultaSniffer(
  page: Page,
  onHit?: (hit: FelPortalSniffHit) => void
): { stop: () => FelPortalSniffHit[]; hits: FelPortalSniffHit[] } {
  const hits: FelPortalSniffHit[] = []

  const handler = async (res: HTTPResponse) => {
    try {
      const url = res.url()
      if (!url.includes("/api/consulta-dte") || url.includes("zip-xml")) return
      if (res.status() !== 200) return
      const ct = res.headers()["content-type"] ?? ""
      if (!ct.includes("json") && !ct.includes("text")) return
      const json = (await res.json()) as unknown
      const rowCount = extractConsultaDteList(json).length
      const hit: FelPortalSniffHit = {
        operationType: opFromUrl(url),
        url,
        urlRedacted: redactConsultaUrl(url),
        rowCount,
        totalReported: totalFromJson(json),
        json,
      }
      hits.push(hit)
      onHit?.(hit)
    } catch {
      /* ignore parse errors */
    }
  }

  page.on("response", handler)
  return {
    hits,
    stop: () => {
      page.off("response", handler)
      return hits
    },
  }
}

/** Usuario/NIT que la SPA muestra o guarda (puede diferir del login farm3). */
export async function readFelconsSessionUsuario(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const pick = (s: string | null | undefined) => {
      const t = (s ?? "").trim().replace(/\D/g, "")
      return t.length >= 4 && t.length <= 15 ? t : null
    }
    for (const store of [localStorage, sessionStorage]) {
      try {
        for (let i = 0; i < store.length; i++) {
          const k = store.key(i)
          if (!k || !/usuario|nit|contrib|emisor|receptor|fel/i.test(k)) continue
          const v = store.getItem(k)
          const n = pick(v)
          if (n) return n
        }
      } catch {
        /* ignore */
      }
    }
    const body = document.body?.innerText ?? ""
    const m = body.match(/NIT[:\s]*([0-9]{4,15})/i)
    if (m?.[1]) return m[1].replace(/\D/g, "")
    return null
  })
}

/** Lee pistas de usuario/NIT que la SPA guarda en el navegador. */
export async function readFelconsStorageHints(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const out: Record<string, string> = {}
    const tryStore = (store: Storage) => {
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i)
        if (!k) continue
        const lower = k.toLowerCase()
        if (!/usuario|nit|user|tax|contrib|emisor|receptor|fel|dte/.test(lower)) continue
        const v = store.getItem(k)
        if (v && v.length < 200) out[k] = v
      }
    }
    try {
      tryStore(localStorage)
      tryStore(sessionStorage)
    } catch {
      /* ignore */
    }
    return out
  })
}

export type FelPortalUiCapture = {
  json: unknown | null
  hits: FelPortalSniffHit[]
  consultUrl: string | null
}

/** Dispara consulta en la UI y devuelve la mejor respuesta + URLs capturadas. */
export async function captureConsultaDteViaPortalUiEnhanced(
  page: Page,
  operationType: "E" | "R",
  dateFromIso: string,
  dateToIso: string,
  onCheckpoint?: (stage: string, detail?: string) => void
): Promise<FelPortalUiCapture> {
  const fromDisplay = isoToDdMmYyyyDisplay(dateFromIso)
  const toDisplay = isoToDdMmYyyyDisplay(dateToIso)
  if (!fromDisplay || !toDisplay) {
    return { json: null, hits: [], consultUrl: null }
  }

  const sniffer = attachFelconsConsultaSniffer(page, (h) =>
    onCheckpoint?.("portal_sniff", `${h.operationType} rows=${h.rowCount} total=${h.totalReported}`)
  )

  if (!page.url().includes("dte-consulta")) {
    await page
      .goto("https://felcons.c.sat.gob.gt/dte-agencia-virtual/dte-consulta", {
        waitUntil: "networkidle2",
        timeout: 90000,
      })
      .catch(() => {})
    await new Promise((r) => setTimeout(r, 2500))
  }

  onCheckpoint?.("portal_ui_trigger_start", `${operationType} ${fromDisplay}..${toDisplay}`)

  const clicked = await page.evaluate(
    (op, from, to) => {
      const clickText = (needles: string[]) => {
        const nodes = document.querySelectorAll(
          "button, a, [role='tab'], .p-tabview-nav-link, .ui-tabmenuitem, .ui-menuitem-text, label, span, li"
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
        clickText(["recibid", "compras", "receptor", "documentos recibidos"])
      } else {
        clickText(["emitid", "ventas", "emisor", "documentos emitidos"])
      }

      const inputs = Array.from(
        document.querySelectorAll(
          "input[type='text'], input[type='date'], input.p-inputtext, input[placeholder*='fecha' i], input[placeholder*='date' i]"
        )
      ) as HTMLInputElement[]

      const setVal = (el: HTMLInputElement, v: string) => {
        el.focus()
        el.select?.()
        el.value = v
        el.dispatchEvent(new Event("input", { bubbles: true }))
        el.dispatchEvent(new Event("change", { bubbles: true }))
        el.dispatchEvent(new Event("blur", { bubbles: true }))
      }

      const visible = inputs.filter((i) => {
        const r = i.getBoundingClientRect()
        return r.width > 0 && r.height > 0
      })

      if (visible.length >= 2) {
        setVal(visible[0], from)
        setVal(visible[1], to)
      }

      const consultClicked = clickText(["consultar", "buscar", "filtrar", "aplicar", "generar", "search"])
      return { consultClicked, inputCount: visible.length }
    },
    operationType,
    fromDisplay,
    toDisplay
  )

  onCheckpoint?.(
    "portal_ui_trigger_done",
    `consult=${clicked.consultClicked} inputs=${clicked.inputCount}`
  )

  await new Promise((r) => setTimeout(r, 8000))

  const hits = sniffer.stop()
  const forOp = hits.filter((h) => h.operationType === operationType || h.operationType === "?")
  const best = [...forOp].sort(
    (a, b) => b.rowCount - a.rowCount || b.totalReported - a.totalReported
  )[0]

  let json: unknown | null = null
  let consultUrl: string | null = null

  if (best && (best.rowCount > 0 || best.totalReported > 0)) {
    json = best.json
    consultUrl = best.urlRedacted
    onCheckpoint?.("portal_ui_best", `rows=${best.rowCount} url=${best.urlRedacted.slice(0, 120)}`)
  }

  if (json) {
    onCheckpoint?.("portal_ui_response", `rows=${extractConsultaDteList(json).length}`)
  } else {
    onCheckpoint?.("portal_ui_no_json", `sniff_hits=${hits.length}`)
  }

  return { json, hits, consultUrl }
}
