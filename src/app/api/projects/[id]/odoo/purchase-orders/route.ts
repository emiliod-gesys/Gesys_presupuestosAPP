import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { NextResponse } from "next/server"
import { formatOdooUserFacingError } from "@/lib/odoo/client"
import { fetchOdooPurchaseOrdersForUser } from "@/lib/odoo/import-records"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const projectId = (await params).id
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ message: "No autorizado" }, { status: 401 })

  const { data: membership } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .single()

  if (!membership) return NextResponse.json({ message: "Prohibido" }, { status: 403 })

  const { data: creds } = await supabase
    .from("user_odoo_settings")
    .select("odoo_url, odoo_database, odoo_login, odoo_password, odoo_company_id")
    .eq("user_id", user.id)
    .maybeSingle()

  if (!creds?.odoo_url || !creds.odoo_login || !creds.odoo_password) {
    return NextResponse.json(
      { message: "Configura la vinculación Odoo en tu perfil." },
      { status: 400 }
    )
  }

  let body: { companyId?: unknown; dateFrom?: unknown; dateTo?: unknown }
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const dateFrom = typeof body.dateFrom === "string" ? body.dateFrom.trim() : ""
  const dateTo = typeof body.dateTo === "string" ? body.dateTo.trim() : ""
  if (!dateFrom || !dateTo) {
    return NextResponse.json({ message: "Indica rango de fechas (desde y hasta)." }, { status: 400 })
  }

  const fromBody = body.companyId != null && body.companyId !== "" ? Number(body.companyId) : NaN
  const saved = creds.odoo_company_id != null ? Number(creds.odoo_company_id) : NaN
  const companyId = Number.isFinite(fromBody) && fromBody > 0 ? fromBody : Number.isFinite(saved) && saved > 0 ? saved : NaN

  if (!Number.isFinite(companyId) || companyId <= 0) {
    return NextResponse.json(
      { message: "Selecciona una empresa Odoo en tu perfil o con el selector." },
      { status: 400 }
    )
  }

  try {
    const rows = await fetchOdooPurchaseOrdersForUser(creds, { companyId, dateFrom, dateTo })
    return NextResponse.json({ rows })
  } catch (e) {
    const msg = formatOdooUserFacingError(e)
    return NextResponse.json({ message: msg }, { status: 502 })
  }
}
