import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/service-role"

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
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
    .eq("project_id", id)
    .eq("user_id", user.id)
    .single()

  if (!membership || membership.role !== "admin") {
    return NextResponse.json({ error: "Solo administradores pueden editar el proyecto" }, { status: 403 })
  }

  const { data: existing } = await supabase.from("projects").select("status").eq("id", id).single()
  if (existing?.status === "archived") {
    return NextResponse.json(
      { error: "Proyecto archivado: reactívalo desde el resumen para editar la ficha." },
      { status: 403 }
    )
  }

  const json = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!json || typeof json !== "object") {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 })
  }

  const toNullOrTrim = (v: unknown) => (typeof v === "string" ? v.trim() || null : null)
  const toDateOrNull = (v: unknown) => {
    if (typeof v !== "string" || !v.trim()) return null
    const s = v.trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
    return s
  }

  const nameRaw = typeof json.name === "string" ? json.name.trim() : ""
  if (!nameRaw) {
    return NextResponse.json({ error: "El nombre del proyecto es obligatorio" }, { status: 400 })
  }

  const update = {
    name: nameRaw,
    client: toNullOrTrim(json.client),
    location: toNullOrTrim(json.location),
    start_date: toDateOrNull(json.start_date),
    end_date: toDateOrNull(json.end_date),
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase.from("projects").update(update).eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from("project_logs").insert({
    project_id: id,
    user_id: user.id,
    action: "project_info_updated",
    details: {
      name: update.name,
      client: update.client,
      location: update.location,
      start_date: update.start_date,
      end_date: update.end_date,
    },
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
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
    .eq("project_id", id)
    .eq("user_id", user.id)
    .maybeSingle()

  if (!membership || membership.role !== "admin") {
    return NextResponse.json({ error: "Solo administradores pueden eliminar el proyecto" }, { status: 403 })
  }

  const service = createServiceRoleClient()
  if (service) {
    const { data: deleted, error } = await service.from("projects").delete().eq("id", id).select("id")
    if (error) {
      return NextResponse.json(
        { error: error.message, code: error.code, hint: error.hint },
        { status: 500 }
      )
    }
    if (!deleted?.length) {
      return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  }

  const { error } = await supabase.rpc("delete_project_as_admin", { p_project_id: id })
  if (error) {
    const msg = error.message ?? ""
    if (/Solo administradores pueden eliminar el proyecto/i.test(msg)) {
      return NextResponse.json(
        { error: msg, code: error.code, hint: error.hint },
        { status: 403 }
      )
    }
    if (/Proyecto no encontrado/i.test(msg)) {
      return NextResponse.json(
        {
          error: msg,
          code: error.code,
          hint:
            "Añade SUPABASE_SERVICE_ROLE_KEY en el servidor (Vercel) o en Supabase ejecuta la RPC con dueño que omita RLS (ALTER FUNCTION … OWNER TO postgres).",
        },
        { status: 404 }
      )
    }
    if (/No autorizado/i.test(msg)) {
      return NextResponse.json({ error: msg, code: error.code, hint: error.hint }, { status: 401 })
    }
    return NextResponse.json(
      { error: msg || "No se pudo eliminar el proyecto", code: error.code, hint: error.hint },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true })
}
