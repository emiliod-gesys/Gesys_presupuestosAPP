import type { UserOdooSettings } from "@/lib/types"
import {
  buildOdooDatabaseCandidates,
  normalizeOdooBaseUrl,
  odooAuthenticateWithDbCandidates,
  odooFetchWebLoginHtml,
  odooJsonRpc,
  odooListDatabases,
  odooSearchRead,
  parseDbHintsFromLoginHtml,
  resolveOdooDatabase,
} from "@/lib/odoo/client"

export type OdooDiagnosticStep = { step: string; ok: boolean; detail?: string }

export type OdooDiagnosticResult = {
  baseUrl: string
  inferredDbFromUrl: string | null
  explicitDbInProfile: string | null
  steps: OdooDiagnosticStep[]
  dbListRpc: string[]
  loginHtmlBytes: number
  hintsFromLoginHtml: string[]
  dbCandidates: string[] | null
  authenticated: { db: string; uid: number } | null
  companiesSample: { id: number; name: string }[]
}

function pushStep(
  steps: OdooDiagnosticStep[],
  step: string,
  ok: boolean,
  detail?: string
) {
  steps.push({ step, ok, detail: detail ? detail.slice(0, 1200) : undefined })
}

/**
 * Pruebas de conectividad y autenticación (misma lógica que importación).
 * No incluye contraseña en la respuesta.
 */
export async function runOdooConnectionDiagnostic(
  settings: Pick<UserOdooSettings, "odoo_url" | "odoo_database" | "odoo_login" | "odoo_password">
): Promise<OdooDiagnosticResult> {
  const steps: OdooDiagnosticStep[] = []
  const urlRaw = settings.odoo_url?.trim() || ""
  const baseUrl = urlRaw ? normalizeOdooBaseUrl(urlRaw) : ""
  const explicit = settings.odoo_database?.trim() || null
  const login = settings.odoo_login?.trim() || ""
  const password = settings.odoo_password || ""

  if (!urlRaw) {
    pushStep(steps, "url", false, "Falta URL de Odoo en el perfil.")
    return {
      baseUrl: "",
      inferredDbFromUrl: null,
      explicitDbInProfile: explicit,
      steps,
      dbListRpc: [],
      loginHtmlBytes: 0,
      hintsFromLoginHtml: [],
      dbCandidates: null,
      authenticated: null,
      companiesSample: [],
    }
  }

  pushStep(steps, "url", true, baseUrl)

  try {
    const v = await odooJsonRpc(baseUrl, "common", "version", [])
    const s =
      v && typeof v === "object"
        ? JSON.stringify(v).slice(0, 400)
        : String(v).slice(0, 400)
    pushStep(steps, "jsonrpc_common_version", true, s)
  } catch (e) {
    pushStep(steps, "jsonrpc_common_version", false, e instanceof Error ? e.message : String(e))
  }

  const dbListRpc = await odooListDatabases(baseUrl)
  pushStep(
    steps,
    "db_list",
    true,
    dbListRpc.length > 0 ? dbListRpc.join(", ") : "(vacío: normal en Odoo Online o listado deshabilitado)"
  )

  let html = ""
  let hints: string[] = []
  try {
    html = await odooFetchWebLoginHtml(baseUrl)
    hints = parseDbHintsFromLoginHtml(html)
    pushStep(
      steps,
      "web_login_page",
      true,
      `HTML ${html.length} bytes · pistas de nombre de base en HTML: ${hints.length}${hints.length ? ` → ${hints.join(", ")}` : ""}`
    )
  } catch (e) {
    pushStep(steps, "web_login_page", false, e instanceof Error ? e.message : String(e))
  }

  let dbCandidates: string[] | null = null
  try {
    dbCandidates = await buildOdooDatabaseCandidates(baseUrl, urlRaw, explicit)
    pushStep(steps, "db_candidates", true, dbCandidates.join(" → "))
  } catch (e) {
    pushStep(steps, "db_candidates", false, e instanceof Error ? e.message : String(e))
  }

  let authenticated: { db: string; uid: number } | null = null
  let companiesSample: { id: number; name: string }[] = []

  if (!login || !password) {
    pushStep(steps, "authenticate", false, "Falta usuario o contraseña guardada en el perfil.")
  } else if (!dbCandidates || dbCandidates.length === 0) {
    pushStep(steps, "authenticate", false, "No hay nombres de base candidatos.")
  } else {
    try {
      const { uid, db } = await odooAuthenticateWithDbCandidates(baseUrl, dbCandidates, login, password)
      authenticated = { db, uid }
      pushStep(steps, "authenticate", true, `Base usada: ${db} · uid: ${uid}`)
      try {
        const rows = await odooSearchRead(baseUrl, db, uid, password, "res.company", [], {
          fields: ["id", "name"],
          limit: 5,
          order: "id asc",
        })
        companiesSample = rows.map((r) => ({
          id: Number(r.id),
          name: String(r.name ?? ""),
        }))
        pushStep(
          steps,
          "res_company_sample",
          true,
          companiesSample.map((c) => `${c.id}:${c.name}`).join(" · ")
        )
      } catch (e) {
        pushStep(steps, "res_company_sample", false, e instanceof Error ? e.message : String(e))
      }
    } catch (e) {
      pushStep(steps, "authenticate", false, e instanceof Error ? e.message : String(e))
    }
  }

  return {
    baseUrl,
    inferredDbFromUrl: resolveOdooDatabase(urlRaw, null),
    explicitDbInProfile: explicit,
    steps,
    dbListRpc,
    loginHtmlBytes: html.length,
    hintsFromLoginHtml: hints,
    dbCandidates,
    authenticated,
    companiesSample,
  }
}
