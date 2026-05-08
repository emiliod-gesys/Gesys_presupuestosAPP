import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { NextResponse } from "next/server"
import { formatOdooUserFacingError } from "@/lib/odoo/client"
import { fetchOdooCompaniesForUser } from "@/lib/odoo/import-records"

/** Lista empresas Odoo (res.company) con las credenciales del usuario en sesión. */
export async function POST() {
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

  const { data: creds } = await supabase
    .from("user_odoo_settings")
    .select("odoo_url, odoo_database, odoo_login, odoo_password")
    .eq("user_id", user.id)
    .maybeSingle()

  if (!creds?.odoo_url || !creds.odoo_login || !creds.odoo_password) {
    return NextResponse.json(
      { message: "Configura primero URL, base de datos (si aplica), usuario y contraseña de Odoo en tu perfil." },
      { status: 400 }
    )
  }

  try {
    const companies = await fetchOdooCompaniesForUser(creds)
    return NextResponse.json({ companies })
  } catch (e) {
    const msg = formatOdooUserFacingError(e, { odooUrl: creds.odoo_url, odooLogin: creds.odoo_login })
    return NextResponse.json({ message: msg }, { status: 502 })
  }
}
