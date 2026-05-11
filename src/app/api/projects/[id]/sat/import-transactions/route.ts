import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { NextResponse } from "next/server"
import { satFelExternalRef, type SatFelCheckpoint } from "@/lib/sat-gt/fel-types"

type ImportItem = {
  uuid: string
  flow: "expense" | "income"
  label: string
  name: string
  date: string | null
  amount: number
  partnerName: string | null
  categoryId: string
  transactionTypeId: string
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const projectId = (await params).id
  const runStarted = Date.now()
  const checkpoints: SatFelCheckpoint[] = []
  const cp = (stage: string, detail?: string) => {
    const row: SatFelCheckpoint = { stage, atMs: Date.now() - runStarted }
    if (detail != null && detail !== "") row.detail = detail
    checkpoints.push(row)
  }

  cp("import.request_start")
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
  if (!user) {
    cp("import.auth_failed")
    return NextResponse.json({ message: "No autorizado", checkpoints }, { status: 401 })
  }
  cp("import.auth_ok")

  const { data: membership } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .single()

  if (!membership || membership.role === "observer") {
    cp("import.forbidden", membership ? "observer" : "no_member")
    return NextResponse.json({ message: "No tienes permiso para importar", checkpoints }, { status: 403 })
  }
  cp("import.membership_ok", membership.role)

  let body: { items?: ImportItem[] }
  try {
    body = await req.json()
  } catch {
    cp("import.body_invalid")
    return NextResponse.json({ message: "JSON inválido", checkpoints }, { status: 400 })
  }

  const items = Array.isArray(body.items) ? body.items : []
  if (items.length === 0) {
    cp("import.no_items")
    return NextResponse.json({ message: "Sin ítems", checkpoints }, { status: 400 })
  }
  if (items.length > 50) {
    cp("import.too_many_items", String(items.length))
    return NextResponse.json({ message: "Máximo 50 por solicitud", checkpoints }, { status: 400 })
  }
  cp("import.items_received", `count=${items.length}`)

  const { data: project } = await supabase.from("projects").select("id, status").eq("id", projectId).single()
  if (!project || project.status === "archived") {
    cp("import.project_blocked", project?.status ?? "missing")
    return NextResponse.json({ message: "Proyecto no disponible o archivado", checkpoints }, { status: 400 })
  }
  cp("import.project_ok", project.status)

  let imported = 0
  const skipped: string[] = []
  const errors: string[] = []
  let invalidItem = 0
  let duplicateItem = 0
  let categoryInvalid = 0
  let typeInvalid = 0

  let insertFailed = 0
  cp("import.loop_start")
  for (const row of items) {
    if (
      !row ||
      typeof row.uuid !== "string" ||
      !row.uuid.trim() ||
      (row.flow !== "expense" && row.flow !== "income") ||
      typeof row.name !== "string" ||
      typeof row.amount !== "number" ||
      !Number.isFinite(row.amount) ||
      row.amount === 0 ||
      typeof row.categoryId !== "string" ||
      typeof row.transactionTypeId !== "string"
    ) {
      errors.push("Ítem con datos inválidos omitido")
      invalidItem++
      continue
    }

    const marker = satFelExternalRef(row.uuid.trim())
    const { data: dup } = await supabase
      .from("transactions")
      .select("id")
      .eq("project_id", projectId)
      .ilike("notes", `%${marker}%`)
      .maybeSingle()
    if (dup) {
      skipped.push(row.name)
      duplicateItem++
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
      categoryInvalid++
      continue
    }

    const { data: tt } = await supabase
      .from("transaction_types")
      .select("id, type")
      .eq("id", row.transactionTypeId)
      .maybeSingle()
    if (!tt || tt.type !== row.flow) {
      errors.push(`${row.name}: tipo de transacción incompatible con el documento (gasto/ingreso)`)
      typeInvalid++
      continue
    }

    const partner = row.partnerName?.trim()
    const desc = `[SAT FEL] ${row.label}: ${row.name}${partner ? ` — ${partner}` : ""}`.slice(0, 500)
    const dateStr =
      row.date && /^\d{4}-\d{2}-\d{2}$/.test(row.date) ? row.date : new Date().toISOString().slice(0, 10)

    const { error: insErr } = await supabase.from("transactions").insert({
      project_id: projectId,
      category_id: row.categoryId,
      reservation_id: null,
      transaction_type_id: row.transactionTypeId,
      description: desc,
      amount: row.amount,
      date: dateStr,
      reference_number: row.name.slice(0, 120),
      vendor: partner ? partner.slice(0, 200) : null,
      attachment_url: null,
      notes: `${marker}\nImportado desde consulta DTE SAT (FEL).`,
      created_by: user.id,
    })

    if (insErr) {
      errors.push(`${row.name}: ${insErr.message}`)
      insertFailed++
    } else {
      imported++
    }
  }

  cp(
    "import.loop_done",
    `imported=${imported} insert_failed=${insertFailed} skipped_dup=${duplicateItem} invalid=${invalidItem} category_bad=${categoryInvalid} type_bad=${typeInvalid} errors_msg=${errors.length}`
  )
  return NextResponse.json({ imported, skipped, errors, checkpoints })
}
