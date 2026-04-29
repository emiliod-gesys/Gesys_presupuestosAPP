import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

type Body = {
  mode?: "new" | "existing"
  family_name?: string
  family_id?: string
  new_project_name?: string
}

async function copyBudgetCategories(supabase: SupabaseClient, sourceId: string, newId: string) {
  const { data: cats } = await supabase
    .from("budget_categories")
    .select("*")
    .eq("project_id", sourceId)
    .order("order_index")

  if (!cats?.length) return

  const sorted = [...cats].sort((a, b) => (Number(a.order_index) || 0) - (Number(b.order_index) || 0))
  const idMap = new Map<string, string>()
  const pool = [...sorted]
  let guard = 0
  while (pool.length && guard < 500) {
    guard += 1
    const idx = pool.findIndex((c) => !c.parent_id || idMap.has(c.parent_id as string))
    if (idx === -1) break
    const c = pool.splice(idx, 1)[0]
    const parentId = c.parent_id ? idMap.get(c.parent_id as string) ?? null : null
    const { data: row, error: catErr } = await supabase
      .from("budget_categories")
      .insert({
        project_id: newId,
        name: c.name,
        description: c.description,
        budget_amount: c.budget_amount,
        parent_id: parentId,
        order_index: c.order_index ?? 0,
      })
      .select("id")
      .single()
    if (!catErr && row?.id) idMap.set(c.id as string, row.id as string)
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: sourceId } = await params
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
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const { data: membership } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", sourceId)
    .eq("user_id", user.id)
    .single()

  if (!membership || membership.role !== "admin") {
    return NextResponse.json({ error: "Solo administradores pueden crear un proyecto hermano" }, { status: 403 })
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const mode = body.mode === "existing" ? "existing" : "new"

  const { data: src, error: srcErr } = await supabase.from("projects").select("*").eq("id", sourceId).single()
  if (srcErr || !src) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 })

  if (src.status === "archived") {
    return NextResponse.json({ error: "No se puede crear un hermano desde un proyecto archivado" }, { status: 400 })
  }

  let familyId: string

  if (mode === "new") {
    const familyName = body.family_name?.trim()
    if (!familyName) {
      return NextResponse.json({ error: "Indica el nombre de la nueva familia" }, { status: 400 })
    }
    const { data: fam, error: famErr } = await supabase
      .from("project_families")
      .insert({ name: familyName, created_by: user.id })
      .select("id")
      .single()
    if (famErr || !fam?.id) {
      return NextResponse.json({ error: famErr?.message || "No se pudo crear la familia" }, { status: 500 })
    }
    familyId = fam.id as string
    const { error: upSrc } = await supabase.from("projects").update({ family_id: familyId }).eq("id", sourceId)
    if (upSrc) {
      return NextResponse.json({ error: upSrc.message || "No se pudo vincular el proyecto actual" }, { status: 500 })
    }
  } else {
    const fid = body.family_id?.trim()
    if (!fid) {
      return NextResponse.json({ error: "Selecciona una familia existente" }, { status: 400 })
    }
    const srcFamily = src.family_id as string | null
    if (srcFamily && srcFamily !== fid) {
      return NextResponse.json(
        {
          error:
            "Este proyecto ya pertenece a otra familia. Elige crear una familia nueva o usa la familia actual del proyecto.",
        },
        { status: 400 }
      )
    }
    const { data: famRow, error: famSelErr } = await supabase.from("project_families").select("id").eq("id", fid).maybeSingle()
    if (famSelErr || !famRow) {
      return NextResponse.json({ error: "Familia no encontrada o sin acceso" }, { status: 404 })
    }
    familyId = fid
    if (!srcFamily) {
      const { error: upSrc } = await supabase.from("projects").update({ family_id: familyId }).eq("id", sourceId)
      if (upSrc) {
        return NextResponse.json({ error: upSrc.message || "No se pudo vincular el proyecto actual" }, { status: 500 })
      }
    }
  }

  const newName = body.new_project_name?.trim() || `${src.name} (hermano)`

  const { data: created, error: insErr } = await supabase
    .from("projects")
    .insert({
      name: newName,
      description: src.description,
      location: src.location,
      client: src.client,
      start_date: src.start_date,
      end_date: src.end_date,
      status: "active",
      is_template: false,
      template_id: null,
      family_id: familyId,
      created_by: user.id,
      total_budget: src.total_budget,
      currency: src.currency,
    })
    .select("id")
    .single()

  if (insErr || !created) {
    return NextResponse.json({ error: insErr?.message || "Error al crear el proyecto" }, { status: 500 })
  }

  const newId = created.id as string

  await supabase.from("project_members").insert({
    project_id: newId,
    user_id: user.id,
    role: "admin",
  })

  await copyBudgetCategories(supabase, sourceId, newId)

  await supabase.from("project_logs").insert({
    project_id: newId,
    user_id: user.id,
    action: "project_sibling_created",
    details: { from_project_id: sourceId, family_id: familyId, name: newName },
  })

  await supabase.from("project_logs").insert({
    project_id: sourceId,
    user_id: user.id,
    action: "project_sibling_linked",
    details: { new_project_id: newId, family_id: familyId, name: newName },
  })

  return NextResponse.json({ id: newId, family_id: familyId })
}
