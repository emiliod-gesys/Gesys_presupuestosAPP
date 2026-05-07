/**
 * Convierte el texto guardado en un href absoluto apto para <a href target="_blank">.
 * Sin https:// el navegador interpreta valores como rutas relativas al sitio actual → 404.
 */
export function resolveTransactionAttachmentUrl(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const t = String(raw).trim()
  if (!t) return null

  if (/^https?:\/\//i.test(t)) return t
  if (/^mailto:/i.test(t) || /^tel:/i.test(t)) return t

  if (t.startsWith("//")) return `https:${t}`

  // Ruta absoluta solo en este dominio — el llamador debe pasar prefijo público si aplica
  if (t.startsWith("/")) return t

  // "drive.google.com/...", "sharepoint.com/...", etc.
  return `https://${t.replace(/^\/+/, "")}`
}
