/**
 * Cliente JSON-RPC estándar de Odoo (External API).
 * @see https://www.odoo.com/documentation/master/developer/reference/external_api.html
 */

export function normalizeOdooBaseUrl(url: string): string {
  let u = url.trim().replace(/\/+$/, "")
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`
  return u
}

/** Si el usuario no indica base, intenta subdominio *.odoo.com */
export function resolveOdooDatabase(odooUrl: string | null, explicit: string | null): string | null {
  const ex = explicit?.trim()
  if (ex) return ex
  if (!odooUrl?.trim()) return null
  try {
    const u = new URL(normalizeOdooBaseUrl(odooUrl))
    const host = u.hostname.toLowerCase()
    const m = host.match(/^([a-z0-9_-]+)\.odoo\.com$/)
    if (m) return m[1]
  } catch {
    /* ignore */
  }
  return null
}

/** URL apunta a Odoo en la nube (hostname …odoo.com). */
export function isOdooPublicCloudUrl(odooUrl: string | null | undefined): boolean {
  if (!odooUrl?.trim()) return false
  try {
    const host = new URL(normalizeOdooBaseUrl(odooUrl)).hostname.toLowerCase()
    return host === "odoo.com" || host.endsWith(".odoo.com")
  } catch {
    return false
  }
}

/**
 * Lista bases que la instancia expone por JSON-RPC (`db.list`), si está permitido.
 * En Odoo Online / SaaS suele fallar o devolver vacío; en servidor propio suele funcionar.
 */
export async function odooListDatabases(baseUrl: string): Promise<string[]> {
  try {
    const r = await odooJsonRpc(baseUrl, "db", "list", [])
    if (Array.isArray(r)) return r.filter((x): x is string => typeof x === "string" && x.length > 0)
  } catch {
    /* db.list deshabilitado o no disponible */
  }
  return []
}

/** Nombres de base plausibles (PostgreSQL / Odoo típico). */
function isLikelyOdooDbName(s: string): boolean {
  if (s.length < 1 || s.length > 128) return false
  return /^[\w.-]+$/.test(s)
}

/**
 * Odoo SaaS suele renderizar SPA: el nombre de base puede estar en bundles (`"db":"…"`),
 * `dbname`, campo oculto o data-db.
 */
export function parseDbHintsFromLoginHtml(html: string): string[] {
  const slice = html.length > 900_000 ? html.slice(0, 900_000) : html
  const out: string[] = []
  const seen = new Set<string>()
  const add = (raw: string | undefined) => {
    const v = raw?.trim()
    if (!v || !isLikelyOdooDbName(v)) return
    const k = v.toLowerCase()
    if (seen.has(k)) return
    seen.add(k)
    out.push(v)
  }

  const inputPatterns = [
    /name=["']db["'][^>]*value=["']([^"']*)["']/i,
    /value=["']([^"']*)["'][^>]*name=["']db["']/i,
    /data-db=["']([^"']*)["']/i,
    /<input[^>]+name=["']db["'][^>]+>/gi,
  ]
  for (const re of inputPatterns.slice(0, 3)) {
    const m = slice.match(re)
    if (m?.[1]) add(m[1])
  }

  for (const m of slice.matchAll(/"db"\s*:\s*"([^"\\]{1,128})"/gi)) {
    if (m[1]) add(m[1])
  }
  for (const m of slice.matchAll(/"dbname"\s*:\s*"([^"\\]{1,128})"/gi)) {
    if (m[1]) add(m[1])
  }
  for (const m of slice.matchAll(/\bdbname\s*:\s*'([^']{1,128})'/gi)) {
    if (m[1]) add(m[1])
  }

  const hiddenInput = /<input[^>]*>/gi
  let im: RegExpExecArray | null
  while ((im = hiddenInput.exec(slice)) !== null) {
    const tag = im[0]
    if (!/name\s*=\s*["']db["']/i.test(tag)) continue
    const vm = tag.match(/\bvalue\s*=\s*["']([^"']*)["']/i)
    if (vm?.[1]) add(vm[1])
  }

  return out
}

async function fetchOdooLoginPageHtml(baseUrl: string): Promise<string> {
  const root = normalizeOdooBaseUrl(baseUrl)
  const ctrl =
    typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
      ? AbortSignal.timeout(18_000)
      : undefined
  const res = await fetch(`${root}/web/login`, {
    redirect: "follow",
    headers: {
      Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
      "Cache-Control": "no-cache",
    },
    cache: "no-store",
    signal: ctrl,
  })
  if (!res.ok) return ""
  return await res.text()
}

/** @deprecated usar parseDbHintsFromLoginHtml; conservado por compatibilidad */
export async function odooDatabaseFromWebLogin(baseUrl: string): Promise<string | null> {
  try {
    const html = await fetchOdooLoginPageHtml(baseUrl)
    const hints = parseDbHintsFromLoginHtml(html)
    return hints[0] ?? null
  } catch {
    return null
  }
}

function authLooksLikeWrongCredentials(msg: string): boolean {
  const m = msg.toLowerCase()
  return (
    /access denied/i.test(msg) ||
    /wrong login/i.test(m) ||
    /invalid login/i.test(m) ||
    /credencial/i.test(m) ||
    /authentication failed/i.test(m)
  )
}

function authLooksLikeWrongDatabase(msg: string): boolean {
  const m = msg.toLowerCase()
  if (/fatal:\s*database/i.test(m)) return true
  if (/does not exist/i.test(m) && (/database/.test(m) || /postgres/.test(m))) return true
  if (/wrong database/i.test(m) || /unknown database/i.test(m)) return true
  if (/no existe la base/i.test(m)) return true
  if (/\b5432\b/.test(msg)) return true
  return false
}

/** Orden de bases a probar cuando no hay campo explícito en perfil (`db.list` vacío típico en SaaS). */
export async function buildOdooDatabaseCandidates(
  baseUrl: string,
  odooUrl: string,
  explicit: string | null
): Promise<string[]> {
  const explicitTrim = explicit?.trim() ?? ""
  if (explicitTrim) {
    if (!isLikelyOdooDbName(explicitTrim)) {
      throw new Error("Nombre de «Base de datos Odoo» no válido. Usa solo letras, números, guiones y puntos.")
    }
    return [explicitTrim]
  }

  const list = await odooListDatabases(baseUrl)
  if (list.length > 1) {
    throw new Error(
      `Esta instancia Odoo tiene varias bases de datos. Indica en «Base de datos Odoo» del perfil exactamente una de estas: ${list.join(", ")}.`
    )
  }
  if (list.length === 1) {
    return [list[0]!]
  }

  const preferred = resolveOdooDatabase(odooUrl, null)

  let html = ""
  try {
    html = await fetchOdooLoginPageHtml(baseUrl)
  } catch {
    /* sin HTML */
  }
  const hints = parseDbHintsFromLoginHtml(html)

  const ordered: string[] = []
  const seen = new Set<string>()
  const push = (v: string | null | undefined) => {
    const t = typeof v === "string" ? v.trim() : ""
    if (!t || !isLikelyOdooDbName(t)) return
    const k = t.toLowerCase()
    if (seen.has(k)) return
    seen.add(k)
    ordered.push(t)
  }

  for (const h of hints) push(h)
  if (preferred && !seen.has(preferred.toLowerCase())) push(preferred)
  if (preferred) {
    const low = preferred.toLowerCase()
    const up = preferred.toUpperCase()
    if (preferred !== low) push(low)
    if (preferred !== up) push(up)
  }

  if (ordered.length === 0 && preferred) {
    push(preferred)
  }

  if (ordered.length === 0) {
    throw new Error(
      "Indica el nombre de la base de datos Odoo en tu perfil (obligatorio salvo URLs tipo *.odoo.com)."
    )
  }
  return ordered
}

/** Autentica probando cada candidato hasta acertar nombre de base o fallar login. */
export async function odooAuthenticateWithDbCandidates(
  baseUrl: string,
  dbCandidates: string[],
  login: string,
  password: string
): Promise<{ uid: number; db: string }> {
  let lastDbError = ""
  for (let i = 0; i < dbCandidates.length; i++) {
    const db = dbCandidates[i]!
    try {
      const uid = await odooAuthenticate(baseUrl, db, login, password)
      return { uid, db }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (authLooksLikeWrongCredentials(msg)) {
        throw e
      }
      lastDbError = msg
      if (authLooksLikeWrongDatabase(msg) && i < dbCandidates.length - 1) {
        continue
      }
      throw e
    }
  }
  const tried = dbCandidates.join(" · ")
  throw new Error(
    `No se pudo autenticar con ningún nombre de base probado (${tried}). ` +
      (lastDbError ? `Último error del servidor: ${lastDbError.slice(0, 280)} ` : "") +
      "Si usas Odoo en la nube, indica el correo exacto con el que entras desde el navegador (no tiene por qué coincidir el nombre de PostgreSQL de un servidor ajeno)."
  )
}

/**
 * Nombre de base para uso secuencial: primero obtener candidatos con buildOdooDatabaseCandidates,
 * luego odooAuthenticateWithDbCandidates. Conservado para llamadas que ya resolvieron una sola base.
 */
export async function resolveOdooDatabaseForAuth(
  baseUrl: string,
  odooUrl: string,
  explicit: string | null
): Promise<string> {
  const c = await buildOdooDatabaseCandidates(baseUrl, odooUrl, explicit)
  return c[0]!
}

function odooRpcErrorMessage(err: { message?: string; data?: { message?: string; name?: string; debug?: string } }): string {
  const d = err.data
  if (d?.message) return String(d.message)
  if (d?.name && d?.debug) return `${d.name}: ${String(d.debug).slice(0, 200)}`
  if (err.message) return String(err.message)
  return "Error desconocido de Odoo"
}

/**
 * Odoo a veces devuelve textos crudos de PostgreSQL (FATAL, puerto 5432). Los convertimos en
 * instrucciones útiles para el usuario (nombre de base en el perfil, instancia propia, etc.).
 */
export type OdooUserFacingErrorContext = {
  odooUrl?: string | null
  odooLogin?: string | null
}

export function formatOdooUserFacingError(err: unknown, opts?: OdooUserFacingErrorContext): string {
  const raw = err instanceof Error ? err.message : String(err)
  const lower = raw.toLowerCase()
  const cloud = isOdooPublicCloudUrl(opts?.odooUrl)
  const loginLooksAdmin = opts?.odooLogin?.trim().toLowerCase() === "admin"

  if (/fatal:\s*database/i.test(raw) && /does not exist/i.test(raw)) {
    let out =
      "Odoo respondió que no existe esa base de datos en su PostgreSQL interno (nombre distinto al que probamos o instancia mal enlazada). " +
      "Comprueba que «Usuario o correo en Odoo» sea exactamente el mismo con el que inicias sesión en el navegador. " +
      "Si rellenaste «Base de datos Odoo», prueba a dejarlo vacío y guardar otra vez."
    if (cloud && loginLooksAdmin) {
      out +=
        " Tu usuario «admin» puede ser correcto; además confirma contraseña local en el usuario Odoo y que tu plan permita la API externa (según documentación de Odoo)."
    } else if (cloud) {
      out += " En *.odoo.com el acceso JSON-RPC usa el mismo usuario y contraseña que en la web."
    } else {
      out += " En servidor propio confirma el nombre real de la base con quien administra Odoo."
    }
    return out
  }
  if (/connection to server at/i.test(lower) && /5432/.test(raw)) {
    let out =
      "La instancia Odoo respondió con un error de conexión a su PostgreSQL interno. " +
      "Revisa «Base de datos Odoo» o contacta al administrador de esa instancia."
    if (cloud) {
      out += " Si la URL es *.odoo.com, revisa también restricciones del plan (API externa) y nombre de base en el campo opcional."
    }
    return out
  }
  return raw
}

export async function odooJsonRpc(baseUrl: string, service: string, method: string, args: unknown[]): Promise<unknown> {
  const url = `${normalizeOdooBaseUrl(baseUrl)}/jsonrpc`
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { service, method, args },
      id: Date.now(),
    }),
    cache: "no-store",
  })
  if (!res.ok) {
    throw new Error(`Odoo no respondió (${res.status}). Comprueba la URL y que el servidor permita JSON-RPC.`)
  }
  const json = (await res.json()) as { result?: unknown; error?: { message?: string; data?: { message?: string } } }
  if (json.error) {
    throw new Error(odooRpcErrorMessage(json.error))
  }
  return json.result
}

/**
 * Mismo flujo que el cliente web Odoo (`type='json'`). A veces responde distinto que `/jsonrpc` en proxys.
 */
async function odooWebSessionAuthenticate(
  baseUrl: string,
  db: string,
  login: string,
  password: string
): Promise<number> {
  const url = `${normalizeOdooBaseUrl(baseUrl)}/web/session/authenticate`
  const ctrl =
    typeof AbortSignal !== "undefined" && "timeout" in AbortSignal ? AbortSignal.timeout(22_000) : undefined
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { db, login: login.trim(), password },
      id: Date.now(),
    }),
    cache: "no-store",
    signal: ctrl,
  })
  if (!res.ok) {
    throw new Error(`Odoo session (${res.status})`)
  }
  const json = (await res.json()) as {
    result?: { uid?: number } | false | null
    error?: { message?: string; data?: { message?: string } }
  }
  if (json.error) {
    throw new Error(odooRpcErrorMessage(json.error))
  }
  const r = json.result
  if (r && typeof r === "object" && typeof r.uid === "number" && r.uid > 0) return r.uid
  throw new Error("Sesión Odoo rechazada (uid no válido).")
}

export async function odooAuthenticate(baseUrl: string, db: string, login: string, password: string): Promise<number> {
  const loginTrim = login.trim()
  const errs: string[] = []

  const capture = async (fn: () => Promise<number>): Promise<number | null> => {
    try {
      const u = await fn()
      return typeof u === "number" && u > 0 ? u : null
    } catch (e) {
      errs.push(e instanceof Error ? e.message : String(e))
      return null
    }
  }

  let uid = await capture(() => odooWebSessionAuthenticate(baseUrl, db, loginTrim, password))
  if (uid) return uid

  uid = await capture(async () => {
    const r = await odooJsonRpc(baseUrl, "common", "authenticate", [db, loginTrim, password, {}])
    if (typeof r === "number" && r > 0) return r
    if (r && typeof r === "object" && "uid" in r && typeof (r as { uid: unknown }).uid === "number") {
      const u = (r as { uid: number }).uid
      if (u > 0) return u
    }
    throw new Error("JSON-RPC authenticate no devolvió un uid válido.")
  })
  if (uid) return uid

  uid = await capture(async () => {
    const r = await odooJsonRpc(baseUrl, "common", "login", [db, loginTrim, password])
    if (typeof r === "number" && r > 0) return r
    throw new Error("JSON-RPC login no devolvió un uid válido.")
  })
  if (uid) return uid

  uid = await capture(async () => {
    const { odooXmlRpcAuthenticate } = await import("@/lib/odoo/xmlrpc-common")
    return odooXmlRpcAuthenticate(baseUrl, db, loginTrim, password)
  })
  if (uid) return uid

  const last = errs.at(-1) ?? ""
  const hints =
    " En Odoo Online define una contraseña local para el usuario (Ajustes → Usuarios y compañías → Usuarios → Acción → Cambiar contraseña). " +
    "Odoo solo expone datos por API externa en planes que la incluyan (consulta pricing y docs de External API)."
  throw new Error((last ? `${last} ` : "") + hints.trim())
}

export async function odooSearchRead(
  baseUrl: string,
  db: string,
  uid: number,
  password: string,
  model: string,
  domain: unknown[],
  options: { fields: string[]; limit?: number; order?: string; context?: Record<string, unknown> }
): Promise<Record<string, unknown>[]> {
  const { fields, limit = 80, order, context } = options
  const kwargs: Record<string, unknown> = { fields, limit }
  if (order) kwargs.order = order
  if (context && Object.keys(context).length > 0) {
    kwargs.context = context
  }

  const rows = await odooJsonRpc(baseUrl, "object", "execute_kw", [
    db,
    uid,
    password,
    model,
    "search_read",
    [domain],
    kwargs,
  ])
  if (!Array.isArray(rows)) return []
  return rows as Record<string, unknown>[]
}

export function partnerLabel(raw: unknown): string | null {
  if (raw === false || raw == null) return null
  if (Array.isArray(raw) && raw.length >= 2 && typeof raw[1] === "string") return raw[1]
  return null
}

export function num(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw)
  return Number.isFinite(n) ? n : 0
}
