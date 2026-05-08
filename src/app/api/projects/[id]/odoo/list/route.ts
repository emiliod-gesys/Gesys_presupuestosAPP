import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { NextResponse } from "next/server"
import { fetchOdooDocumentsForUser, type OdooDocKind } from "@/lib/odoo/import-records"

const ALL_KINDS: OdooDocKind[] = [
  "vendor_bill",
  "vendor_credit",
  "customer_invoice",
  "customer_credit",
  "payment_out",
  "payment_in",
]

function isOdooDocKind(x: unknown): x is OdooDocKind {
  return typeof x === "string" && (ALL_KINDS as string[]).includes(x)
}

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

  let body: { kinds?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ message: "JSON inválido" }, { status: 400 })
  }

  const kindsRaw = Array.isArray(body.kinds) ? body.kinds : ALL_KINDS
  const kinds = kindsRaw.filter(isOdooDocKind)
  if (kinds.length === 0) {
    return NextResponse.json({ message: "Indica al menos un tipo de documento válido" }, { status: 400 })
  }

  const { data: creds } = await supabase
    .from("user_odoo_settings")
    .select("odoo_url, odoo_database, odoo_login, odoo_password")
    .eq("user_id", user.id)
    .maybeSingle()

  if (!creds?.odoo_url || !creds.odoo_login || !creds.odoo_password) {
    return NextResponse.json(
      { message: "Configura la vinculación Odoo en tu perfil (URL, base de datos si aplica, usuario y contraseña)." },
      { status: 400 }
    )
  }

  try {
    const { rows, warnings } = await fetchOdooDocumentsForUser(creds, kinds)
    return NextResponse.json({ rows, warnings })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al conectar con Odoo"
    return NextResponse.json({ message: msg }, { status: 502 })
  }
}
