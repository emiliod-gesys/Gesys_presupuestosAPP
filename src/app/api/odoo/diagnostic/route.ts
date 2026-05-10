import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { NextResponse } from "next/server"
import { runOdooConnectionDiagnostic } from "@/lib/odoo/diagnostic"

/** Diagnóstico de conexión Odoo (sin exponer contraseña). Solo el usuario autenticado. */
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
      { message: "Guarda primero URL, usuario y contraseña de Odoo en tu perfil." },
      { status: 400 }
    )
  }

  try {
    const report = await runOdooConnectionDiagnostic(creds)
    const ok = report.authenticated != null
    return NextResponse.json({ ok, report })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al ejecutar diagnóstico"
    return NextResponse.json({ message: msg }, { status: 502 })
  }
}
