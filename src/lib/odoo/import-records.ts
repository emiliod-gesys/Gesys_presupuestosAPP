import {
  normalizeOdooBaseUrl,
  resolveOdooDatabase,
  odooAuthenticate,
  odooSearchRead,
  partnerLabel,
  num,
} from "@/lib/odoo/client"
import type { UserOdooSettings } from "@/lib/types"

export type OdooDocKind =
  | "vendor_bill"
  | "vendor_credit"
  | "customer_invoice"
  | "customer_credit"
  | "payment_out"
  | "payment_in"

export type OdooImportRow = {
  odooId: number
  model: "account.move" | "account.payment"
  kind: OdooDocKind
  label: string
  name: string
  date: string | null
  amount: number
  flow: "expense" | "income"
  partnerName: string | null
  ref: string | null
}

export type OdooPurchaseOrderRow = {
  odooId: number
  name: string
  date: string | null
  amount: number
  partnerName: string | null
  state: string | null
}

function moveDate(row: Record<string, unknown>): string | null {
  const d = row.invoice_date || row.date
  if (typeof d === "string" && d.length >= 10) return d.slice(0, 10)
  return null
}

function pushMoves(
  rows: Record<string, unknown>[],
  kind: OdooDocKind,
  flow: "expense" | "income",
  label: string,
  out: OdooImportRow[]
) {
  for (const row of rows) {
    const id = num(row.id)
    if (!id) continue
    const moveType = String(row.move_type || "")
    let raw = Math.abs(num(row.amount_total))
    if (moveType === "in_refund" || moveType === "out_refund") {
      raw = -raw
    }
    const name = String(row.name || `#${id}`)
    out.push({
      odooId: id,
      model: "account.move",
      kind,
      label,
      name,
      date: moveDate(row),
      amount: raw,
      flow,
      partnerName: partnerLabel(row.partner_id),
      ref: row.ref != null ? String(row.ref) : null,
    })
  }
}

export async function fetchOdooDocumentsForUser(
  settings: Pick<UserOdooSettings, "odoo_url" | "odoo_database" | "odoo_login" | "odoo_password">,
  kinds: OdooDocKind[]
): Promise<{ rows: OdooImportRow[]; warnings: string[] }> {
  const warnings: string[] = []
  const url = settings.odoo_url
  const login = settings.odoo_login
  const password = settings.odoo_password
  if (!url?.trim() || !login?.trim() || !password) {
    throw new Error("Completa URL, correo y contraseña de Odoo en tu perfil.")
  }
  const db = resolveOdooDatabase(url, settings.odoo_database)
  if (!db) {
    throw new Error(
      "Indica el nombre de la base de datos Odoo en tu perfil (obligatorio salvo URLs tipo *.odoo.com)."
    )
  }

  const baseUrl = normalizeOdooBaseUrl(url)
  const uid = await odooAuthenticate(baseUrl, db, login.trim(), password)

  const out: OdooImportRow[] = []
  const want = new Set(kinds)

  const moveFields = ["name", "invoice_date", "date", "amount_total", "partner_id", "ref", "move_type", "id"]

  if (want.has("vendor_bill")) {
    const domain = [
      ["state", "=", "posted"],
      ["move_type", "=", "in_invoice"],
    ]
    const rows = await odooSearchRead(baseUrl, db, uid, password, "account.move", domain, {
      fields: moveFields,
      limit: 100,
      order: "invoice_date desc, date desc, id desc",
    })
    pushMoves(rows, "vendor_bill", "expense", "Factura de proveedor", out)
  }

  if (want.has("vendor_credit")) {
    const domain = [
      ["state", "=", "posted"],
      ["move_type", "=", "in_refund"],
    ]
    const rows = await odooSearchRead(baseUrl, db, uid, password, "account.move", domain, {
      fields: moveFields,
      limit: 100,
      order: "invoice_date desc, date desc, id desc",
    })
    pushMoves(rows, "vendor_credit", "expense", "Nota de crédito proveedor", out)
  }

  if (want.has("customer_invoice")) {
    const domain = [
      ["state", "=", "posted"],
      ["move_type", "=", "out_invoice"],
    ]
    const rows = await odooSearchRead(baseUrl, db, uid, password, "account.move", domain, {
      fields: moveFields,
      limit: 100,
      order: "invoice_date desc, date desc, id desc",
    })
    pushMoves(rows, "customer_invoice", "income", "Factura de cliente", out)
  }

  if (want.has("customer_credit")) {
    const domain = [
      ["state", "=", "posted"],
      ["move_type", "=", "out_refund"],
    ]
    const rows = await odooSearchRead(baseUrl, db, uid, password, "account.move", domain, {
      fields: moveFields,
      limit: 100,
      order: "invoice_date desc, date desc, id desc",
    })
    pushMoves(rows, "customer_credit", "income", "Nota de crédito cliente", out)
  }

  if (want.has("payment_out")) {
    try {
      const domain = [
        ["state", "=", "posted"],
        ["payment_type", "=", "outbound"],
      ]
      const rows = await odooSearchRead(baseUrl, db, uid, password, "account.payment", domain, {
        fields: ["name", "date", "amount", "partner_id", "id"],
        limit: 100,
        order: "date desc, id desc",
      })
      for (const row of rows) {
        const id = num(row.id)
        if (!id) continue
        const d = row.date
        const dateStr = typeof d === "string" && d.length >= 10 ? d.slice(0, 10) : null
        out.push({
          odooId: id,
          model: "account.payment",
          kind: "payment_out",
          label: "Pago saliente",
          name: String(row.name || `#${id}`),
          date: dateStr,
          amount: Math.abs(num(row.amount)),
          flow: "expense",
          partnerName: partnerLabel(row.partner_id),
          ref: null,
        })
      }
    } catch (e) {
      warnings.push(
        `Pagos salientes: ${e instanceof Error ? e.message : "modelo account.payment no disponible o sin permiso."}`
      )
    }
  }

  if (want.has("payment_in")) {
    try {
      const domain = [
        ["state", "=", "posted"],
        ["payment_type", "=", "inbound"],
      ]
      const rows = await odooSearchRead(baseUrl, db, uid, password, "account.payment", domain, {
        fields: ["name", "date", "amount", "partner_id", "id"],
        limit: 100,
        order: "date desc, id desc",
      })
      for (const row of rows) {
        const id = num(row.id)
        if (!id) continue
        const d = row.date
        const dateStr = typeof d === "string" && d.length >= 10 ? d.slice(0, 10) : null
        out.push({
          odooId: id,
          model: "account.payment",
          kind: "payment_in",
          label: "Pago entrante",
          name: String(row.name || `#${id}`),
          date: dateStr,
          amount: Math.abs(num(row.amount)),
          flow: "income",
          partnerName: partnerLabel(row.partner_id),
          ref: null,
        })
      }
    } catch (e) {
      warnings.push(
        `Pagos entrantes: ${e instanceof Error ? e.message : "modelo account.payment no disponible o sin permiso."}`
      )
    }
  }

  return { rows: out, warnings }
}

export async function fetchOdooPurchaseOrdersForUser(
  settings: Pick<UserOdooSettings, "odoo_url" | "odoo_database" | "odoo_login" | "odoo_password">
): Promise<OdooPurchaseOrderRow[]> {
  const url = settings.odoo_url
  const login = settings.odoo_login
  const password = settings.odoo_password
  if (!url?.trim() || !login?.trim() || !password) {
    throw new Error("Completa URL, correo y contraseña de Odoo en tu perfil.")
  }
  const db = resolveOdooDatabase(url, settings.odoo_database)
  if (!db) {
    throw new Error(
      "Indica el nombre de la base de datos Odoo en tu perfil (obligatorio salvo URLs tipo *.odoo.com)."
    )
  }
  const baseUrl = normalizeOdooBaseUrl(url)
  const uid = await odooAuthenticate(baseUrl, db, login.trim(), password)

  const domain = [["state", "in", ["purchase", "done"]]]
  const rows = await odooSearchRead(baseUrl, db, uid, password, "purchase.order", domain, {
    fields: ["name", "date_order", "amount_total", "partner_id", "state", "id"],
    limit: 100,
    order: "date_order desc, id desc",
  })

  const out: OdooPurchaseOrderRow[] = []
  for (const row of rows) {
    const id = num(row.id)
    if (!id) continue
    const d = row.date_order
    const dateStr = typeof d === "string" && d.length >= 10 ? d.slice(0, 10) : null
    out.push({
      odooId: id,
      name: String(row.name || `#${id}`),
      date: dateStr,
      amount: Math.abs(num(row.amount_total)),
      partnerName: partnerLabel(row.partner_id),
      state: row.state != null ? String(row.state) : null,
    })
  }
  return out
}

export function odooExternalRef(model: string, odooId: number): string {
  return `odoo:${model}:${odooId}`
}
