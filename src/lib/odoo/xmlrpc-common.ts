/**
 * Llamadas mínimas al endpoint XML-RPC de Odoo (/xmlrpc/2/common).
 * Algunos despliegues enrutan distinto este endpoint frente a /jsonrpc.
 */

function normalizeOdooBaseUrl(url: string): string {
  let u = url.trim().replace(/\/+$/, "")
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`
  return u
}

function escapeXmlText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/** Valor `<string>` en XML-RPC. */
function xrString(value: string): string {
  return `<value><string>${escapeXmlText(value)}</string></value>`
}

/** Valor struct vacío `{}` (último argumento de `authenticate`). */
function xrEmptyStruct(): string {
  return `<value><struct></struct></value>`
}

function buildAuthenticateBody(db: string, login: string, password: string): string {
  return `<?xml version="1.0"?>
<methodCall>
<methodName>authenticate</methodName>
<params>
  <param>${xrString(db)}</param>
  <param>${xrString(login)}</param>
  <param>${xrString(password)}</param>
  <param>${xrEmptyStruct()}</param>
</params>
</methodCall>`
}

function parseAuthenticateResponse(xml: string): number {
  if (/<fault>/i.test(xml)) {
    const msgM = xml.match(/<string>([^<]*)<\/string>/i)
    const msg = msgM?.[1] ? decodeXmlText(msgM[1]) : "fault XML-RPC"
    throw new Error(msg)
  }
  const falseBool = /<value>\s*<boolean>\s*0\s*<\/boolean>\s*<\/value>/i.test(xml)
  if (falseBool) {
    throw new Error("Access denied")
  }
  const intM = xml.match(/<value>\s*<(?:int|i4)>\s*(\d+)\s*<\/(?:int|i4)>\s*<\/value>/i)
  if (intM?.[1]) {
    const n = Number(intM[1])
    if (Number.isFinite(n) && n > 0) return n
  }
  throw new Error("Respuesta XML-RPC de authenticate no reconocida.")
}

function decodeXmlText(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
}

/** `common.authenticate` vía `/xmlrpc/2/common`. */
export async function odooXmlRpcAuthenticate(
  baseUrl: string,
  db: string,
  login: string,
  password: string
): Promise<number> {
  const url = `${normalizeOdooBaseUrl(baseUrl.trim())}/xmlrpc/2/common`
  const ctrl =
    typeof AbortSignal !== "undefined" && "timeout" in AbortSignal ? AbortSignal.timeout(25_000) : undefined
  const body = buildAuthenticateBody(db, login.trim(), password)
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/xml", Accept: "text/xml,text/html,*/*" },
    body,
    cache: "no-store",
    signal: ctrl,
  })
  if (!res.ok) {
    throw new Error(`XML-RPC Odoo (${res.status})`)
  }
  const xml = await res.text()
  return parseAuthenticateResponse(xml)
}
