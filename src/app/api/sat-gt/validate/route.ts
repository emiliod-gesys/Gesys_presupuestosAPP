import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { NextResponse } from "next/server"
import { isValidGtNitFormat, normalizeGtNit } from "@/lib/sat-gt/nit"

/**
 * Comprueba que hay credenciales SAT guardadas y que el NIT tiene formato razonable.
 * La descarga real de DTE desde el portal/FEL será una fase posterior (sin API pública tipo Odoo).
 */
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

  const { data: row } = await supabase
    .from("user_sat_gt_settings")
    .select("nit, portal_login, portal_password")
    .eq("user_id", user.id)
    .maybeSingle()

  if (!row?.nit?.trim() || !row?.portal_password) {
    return NextResponse.json(
      { message: "Guarda primero NIT y contraseña del portal SAT en tu perfil." },
      { status: 400 }
    )
  }

  const nit = normalizeGtNit(row.nit)
  if (!isValidGtNitFormat(nit)) {
    return NextResponse.json(
      { message: "El NIT guardado no tiene un formato numérico válido (4–15 dígitos)." },
      { status: 400 }
    )
  }

  return NextResponse.json({
    ok: true,
    nitDigits: nit.length,
    hasPortalLogin: !!(row.portal_login && row.portal_login.trim()),
    message:
      "Datos listos en el servidor. La sincronización automática de facturas emitidas/recibidas " +
      "se conectará a los flujos oficiales del SAT/FEL (portal o certificador) en una actualización próxima.",
  })
}
