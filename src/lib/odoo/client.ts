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
      "Si la URL es del tipo nombre.odoo.com, prueba a dejar vacío el campo «Base de datos Odoo» del perfil y guardar de nuevo. " +
      "En un servidor propio, el nombre debe coincidir con la base PostgreSQL que usa tu instancia Odoo (consúltalo con quien la administra)."
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
