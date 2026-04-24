import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { NextResponse } from "next/server"

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const { data: membership } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", sourceId)
    .eq("user_id", user.id)
    .single()

  if (!membership || membership.role !== "admin") {
    return NextResponse.json({ error: "Solo administradores pueden duplicar" }, { status: 403 })
  }

  const { data: src, error: srcErr } = await supabase.from("projects").select("*").eq("id", sourceId).single()
  if (srcErr || !src) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 })

  const { data: cats } = await supabase
    .from("budget_categories")
    .select("*")
    .eq("project_id", sourceId)
    .order("order_index")

  const newName = `${src.name} (copia)`

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
      created_by: user.id,
      total_budget: src.total_budget,
      currency: src.currency,
    })
    .select("id")
    .single()

  if (insErr || !created) {
    return NextResponse.json({ error: insErr?.message || "Error al crear copia" }, { status: 500 })
  }

  const newId = created.id as string

  await supabase.from("project_members").insert({
    project_id: newId,
    user_id: user.id,
    role: "admin",
  })

  if (cats?.length) {
    await supabase.from("budget_categories").insert(
      cats.map((c, i) => ({
        project_id: newId,
        name: c.name,
        description: c.description,
        budget_amount: c.budget_amount,
        parent_id: null,
        order_index: c.order_index ?? i,
      }))
    )
  }

  await supabase.from("project_logs").insert({
    project_id: newId,
    user_id: user.id,
    action: "project_duplicated",
    details: { from_project_id: sourceId, name: newName },
  })

  return NextResponse.json({ id: newId })
}
