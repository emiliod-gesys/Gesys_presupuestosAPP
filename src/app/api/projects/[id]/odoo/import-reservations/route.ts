import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { NextResponse } from "next/server"

type PoItem = {
  odooId: number
  name: string
  amount: number
  partnerName: string | null
  categoryId: string
  title?: string
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

  if (!membership || membership.role === "observer") {
    return NextResponse.json({ message: "No tienes permiso para importar" }, { status: 403 })
  }

  let body: { items?: PoItem[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ message: "JSON inválido" }, { status: 400 })
  }

  const items = Array.isArray(body.items) ? body.items : []
  if (items.length === 0) return NextResponse.json({ message: "Sin ítems" }, { status: 400 })
  if (items.length > 50) return NextResponse.json({ message: "Máximo 50 por solicitud" }, { status: 400 })

  const { data: project } = await supabase.from("projects").select("id, status").eq("id", projectId).single()
  if (!project || project.status === "archived") {
    return NextResponse.json({ message: "Proyecto no disponible o archivado" }, { status: 400 })
  }

  let imported = 0
  const skipped: string[] = []
  const errors: string[] = []

  for (const row of items) {
    if (
      !row ||
      typeof row.odooId !== "number" ||
      typeof row.name !== "string" ||
      typeof row.amount !== "number" ||
      row.amount <= 0 ||
      typeof row.categoryId !== "string"
    ) {
      errors.push("Ítem inválido omitido")
      continue
    }

    const marker = `odoo:purchase.order:${row.odooId}`
    const { data: dup } = await supabase
      .from("project_reservations")
      .select("id")
      .eq("project_id", projectId)
      .ilike("details", `%${marker}%`)
      .maybeSingle()
    if (dup) {
      skipped.push(row.name)
      continue
    }

    const { data: cat } = await supabase
      .from("budget_categories")
      .select("id")
      .eq("id", row.categoryId)
      .eq("project_id", projectId)
      .maybeSingle()
    if (!cat) {
      errors.push(`${row.name}: categoría no pertenece al proyecto`)
      continue
    }

    const title = (row.title?.trim() || `OC Odoo ${row.name}`).slice(0, 200)
    const partner = row.partnerName?.trim()
    const details = `${marker}\nImportado desde Odoo. Proveedor: ${partner || "—"}`

    const { error: insErr } = await supabase.from("project_reservations").insert({
      project_id: projectId,
      category_id: row.categoryId,
      title,
      details,
      reserved_amount: row.amount,
      created_by: user.id,
    })

    if (insErr) {
      errors.push(`${row.name}: ${insErr.message}`)
    } else {
      imported++
    }
  }

  return NextResponse.json({ imported, skipped, errors })
}
