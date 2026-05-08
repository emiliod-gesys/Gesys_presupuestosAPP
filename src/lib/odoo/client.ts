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

/** Extrae el valor del campo oculto `db` del HTML de login (misma base que usa la UI web). */
function parseDbFromLoginHtml(html: string): string | null {
  const slice = html.length > 800_000 ? html.slice(0, 800_000) : html
  const patterns = [
    /name=["']db["']\s[^>]*value=["']([^"']*)["']/i,
    /name=["']db["'][^>]*value=["']([^"']*)["']/i,
    /value=["']([^"']*)["'][^>]*name=["']db["']/i,
  ]
  for (const re of patterns) {
    const m = slice.match(re)
    const v = m?.[1]?.trim()
    if (v) return v
  }
  return null
}

/**
 * Odoo Online y muchas instalaciones no exponen `db.list`; el formulario `/web/login` suele
 * incluir `<input name="db" value="…"/>` con el nombre exacto para autenticar.
 */
export async function odooDatabaseFromWebLogin(baseUrl: string): Promise<string | null> {
  const root = normalizeOdooBaseUrl(baseUrl)
  const ctrl =
    typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
      ? AbortSignal.timeout(18_000)
      : undefined
  try {
    const res = await fetch(`${root}/web/login`, {
      redirect: "follow",
      headers: { Accept: "text/html,*/*;q=0.8" },
      cache: "no-store",
      signal: ctrl,
    })
    if (!res.ok) return null
    const html = await res.text()
    return parseDbFromLoginHtml(html)
  } catch {
    return null
  }
}

/**
 * Nombre de base para `authenticate` / `execute_kw`: usa `db.list` cuando hay datos,
 * respeta el valor del perfil si coincide, y si no hay listado conserva la inferencia de `resolveOdooDatabase`.
 */
export async function resolveOdooDatabaseForAuth(
  baseUrl: string,
  odooUrl: string,
  explicit: string | null
): Promise<string> {
  const preferred = resolveOdooDatabase(odooUrl, explicit)
  const list = await odooListDatabases(baseUrl)
  const explicitTrim = explicit?.trim() ?? ""

  if (list.length === 1) {
    return list[0]!
  }

  if (explicitTrim && list.includes(explicitTrim)) {
    return explicitTrim
  }

  if (preferred && list.includes(preferred)) {
    return preferred
  }

  const byLower = new Map(list.map((d) => [d.toLowerCase(), d]))
  const byLowerGet = (s: string) => byLower.get(s.toLowerCase()) ?? null
  if (explicitTrim) {
    const hit = byLowerGet(explicitTrim)
    if (hit) return hit
  }
  if (preferred) {
    const hit = byLowerGet(preferred)
    if (hit) return hit
  }

  if (list.length > 1) {
    throw new Error(
      `Esta instancia Odoo tiene varias bases de datos. Indica en «Base de datos Odoo» del perfil exactamente una de estas: ${list.join(", ")}.`
    )
  }

  const fromLogin = await odooDatabaseFromWebLogin(baseUrl)

  if (explicitTrim) {
    return explicitTrim
  }

  if (fromLogin) {
    return fromLogin
  }

  if (preferred) {
    return preferred
  }

  throw new Error(
    "Indica el nombre de la base de datos Odoo en tu perfil (obligatorio salvo URLs tipo *.odoo.com)."
  )
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
export function formatOdooUserFacingError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  const lower = raw.toLowerCase()
  if (/fatal:\s*database/i.test(raw) && /does not exist/i.test(raw)) {
    return (
      "Odoo no encontró la base de datos con el nombre que enviamos al autenticar. " +
      "La app intenta tomar el nombre desde la página de login de tu URL; comprueba que «Correo en Odoo» sea el mismo que usas en el navegador (en odoo.com suele ser un correo, no la palabra admin salvo que sea tu usuario). " +
      "Si rellenaste «Base de datos Odoo», prueba a vaciarlo y guardar. En servidor propio, el nombre debe coincidir con la base que usa tu instancia."
    )
  }
  if (/connection to server at/i.test(lower) && /5432/.test(raw)) {
    return (
      "La instancia Odoo respondió con un error de conexión a su PostgreSQL interno. " +
      "Suele indicar nombre de base incorrecto en el perfil o un fallo en el servidor Odoo. Revisa «Base de datos Odoo» o contacta al administrador de esa instancia."
    )
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

export async function odooAuthenticate(baseUrl: string, db: string, login: string, password: string): Promise<number> {
  const tryAuth = async (method: string, args: unknown[]) => {
    const r = await odooJsonRpc(baseUrl, "common", method, args)
    return r
  }

  let uid = await tryAuth("authenticate", [db, login, password, {}])
  if (typeof uid === "number" && uid > 0) return uid
  if (uid && typeof uid === "object" && "uid" in uid && typeof (uid as { uid: unknown }).uid === "number") {
    const u = (uid as { uid: number }).uid
    if (u > 0) return u
  }

  uid = await tryAuth("login", [db, login, password])
  if (typeof uid === "number" && uid > 0) return uid

  throw new Error(
    "No se pudo autenticar en Odoo. Revisa base de datos (perfil), usuario y contraseña. En servidores propios el nombre de la base suele ser obligatorio."
  )
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
