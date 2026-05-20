/** Decodifica payload JWT (sin verificar firma) para extraer NIT/usuario del ACCESS_TOKEN del portal. */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const raw = token.trim().replace(/^Bearer\s+/i, "")
  const parts = raw.split(".")
  if (parts.length < 2) return null
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/")
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4))
    const json = Buffer.from(b64 + pad, "base64").toString("utf8")
    const parsed = JSON.parse(json) as unknown
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function pickStringClaim(payload: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const v = payload[key]
    if (typeof v === "string" && v.trim()) return v.trim()
    if (typeof v === "number" && Number.isFinite(v)) return String(Math.trunc(v))
  }
  return null
}

/** Candidatos para `usuario=` en consulta-dte (orden: login, JWT, perfil, variantes numéricas). */
export function buildFelConsultaUsuarioCandidates(
  portalLogin: string,
  profileNit: string | null | undefined,
  accessToken: string
): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const add = (v: string | null | undefined) => {
    const t = (v ?? "").trim()
    if (!t || seen.has(t)) return
    seen.add(t)
    out.push(t)
  }

  add(portalLogin)
  add(profileNit ?? null)

  const payload = decodeJwtPayload(accessToken)
  if (payload) {
    add(
      pickStringClaim(payload, [
        "usuario",
        "Usuario",
        "nit",
        "NIT",
        "nitUsuario",
        "taxId",
        "TAXID",
        "sub",
        "preferred_username",
        "user",
        "user_name",
        "username",
      ])
    )
    const sub = pickStringClaim(payload, ["sub"])
    if (sub && /^\d{4,15}$/.test(sub.replace(/\D/g, ""))) {
      add(sub.replace(/\D/g, ""))
    }
  }

  const digits = portalLogin.replace(/\D/g, "")
  if (digits.length >= 4 && digits.length <= 15) {
    add(digits)
  }
  /** NIT a 12 dígitos: solo si está activado (a veces el SAT devuelve BAD_REQUEST o 0 filas). */
  if (process.env.SAT_FEL_TRY_PADDED_USUARIO === "1" && digits.length >= 4 && digits.length < 12) {
    add(digits.padStart(12, "0"))
  }

  return out
}
