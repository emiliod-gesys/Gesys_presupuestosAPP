import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { NextResponse } from "next/server"
import { runSatFelExtraction, formatSatFelUserError } from "@/lib/sat-gt/fel-scraper"
import { normalizeGtNit } from "@/lib/sat-gt/nit"

/** Puppeteer puede tardar varios minutos en servidores lentos o rangos grandes. */
export const maxDuration = 300
export const runtime = "nodejs"

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
  if (membership.role === "observer") {
    return NextResponse.json({ message: "Los observadores no pueden consultar el SAT" }, { status: 403 })
  }

  let body: { dateFrom?: unknown; dateTo?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ message: "JSON inválido" }, { status: 400 })
  }

  const dateFrom = typeof body.dateFrom === "string" ? body.dateFrom.trim() : ""
  const dateTo = typeof body.dateTo === "string" ? body.dateTo.trim() : ""
  if (!dateFrom || !dateTo || !/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    return NextResponse.json(
      { message: "Indica rango de fechas válido (desde y hasta, formato YYYY-MM-DD)." },
      { status: 400 }
    )
  }
  if (dateFrom > dateTo) {
    return NextResponse.json({ message: "La fecha inicial no puede ser posterior a la final." }, { status: 400 })
  }

  const { data: sat } = await supabase
    .from("user_sat_gt_settings")
    .select("nit, portal_login, portal_password")
    .eq("user_id", user.id)
    .maybeSingle()

  const nitNorm = sat?.nit ? normalizeGtNit(sat.nit) : ""
  const login = (sat?.portal_login?.trim() || nitNorm || "").trim()
  const password = sat?.portal_password || ""

  if (!login || !password) {
    return NextResponse.json(
      {
        message:
          "Configura NIT y contraseña del portal SAT en Mi perfil (y usuario del portal si no es el NIT).",
      },
      { status: 400 }
    )
  }

  try {
    const { rows, warnings, diagnostics } = await runSatFelExtraction({
      portalLogin: login,
      felConsultaUsuario: nitNorm || login,
      portalPassword: password,
      dateFrom,
      dateTo,
    })
    return NextResponse.json({ rows, warnings, diagnostics })
  } catch (e) {
    const message = formatSatFelUserError(e)
    const status = message.includes("Credenciales") ? 401 : 502
    return NextResponse.json({ message }, { status })
  }
}
