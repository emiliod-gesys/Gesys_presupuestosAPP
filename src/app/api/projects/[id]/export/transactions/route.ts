import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { NextResponse } from "next/server"

function csvEscape(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const url = new URL(request.url)
  const q = url.searchParams.get("q")?.trim()
  const from = url.searchParams.get("from")
  const to = url.searchParams.get("to")
  const categoryId = url.searchParams.get("category")
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
  if (!user) return new NextResponse("No autorizado", { status: 401 })

  const { data: membership } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", id)
    .eq("user_id", user.id)
    .single()

  if (!membership) return new NextResponse("Prohibido", { status: 403 })

  let query = supabase
    .from("transactions")
    .select(
      "date, description, amount, reference_number, vendor, attachment_url, notes, transaction_type:transaction_types(name), category:budget_categories(name)"
    )
    .eq("project_id", id)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })

  if (from) query = query.gte("date", from)
  if (to) query = query.lte("date", to)
  if (categoryId) query = query.eq("category_id", categoryId)
  if (q) query = query.ilike("description", `%${q}%`)

  const { data: txTypes } = await supabase.from("transaction_types").select("id, type")
  const expenseTypeIds = (txTypes || []).filter((t) => t.type === "expense").map((t) => t.id)
  if (expenseTypeIds.length > 0) query = query.in("transaction_type_id", expenseTypeIds)

  const { data: rows, error } = await query

  if (error) return new NextResponse(error.message, { status: 500 })

  const header = [
    "Fecha",
    "Descripción",
    "Tipo de gasto",
    "Monto",
    "Renglón",
    "Referencia",
    "Proveedor",
    "URL adjunto",
    "Notas",
  ]

  const lines = [header.join(",")]
  for (const tx of rows || []) {
    const tt = tx.transaction_type as { name?: string } | null
    const cat = tx.category as { name?: string } | null
    lines.push(
      [
        csvEscape(tx.date),
        csvEscape(tx.description),
        csvEscape(tt?.name),
        csvEscape(tx.amount),
        csvEscape(cat?.name),
        csvEscape(tx.reference_number),
        csvEscape((tx as { vendor?: string }).vendor),
        csvEscape((tx as { attachment_url?: string }).attachment_url),
        csvEscape(tx.notes),
      ].join(",")
    )
  }

  const csv = "\uFEFF" + lines.join("\n")

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="transacciones-${id.slice(0, 8)}.csv"`,
    },
  })
}
