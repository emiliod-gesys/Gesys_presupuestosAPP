import Image from "next/image"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import { SatImportPanel } from "@/components/projects/sat-import-panel"
import { leafCategories } from "@/lib/budget-category-tree"

export default async function ProjectSatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const [{ data: membership }, { data: project }, { data: categories }, { data: txTypes }, { data: sat }] =
    await Promise.all([
      supabase.from("project_members").select("role").eq("project_id", id).eq("user_id", user.id).single(),
      supabase.from("projects").select("currency, status").eq("id", id).single(),
      supabase.from("budget_categories").select("id, name, parent_id").eq("project_id", id).order("order_index"),
      supabase.from("transaction_types").select("id, name, type").order("name"),
      supabase.from("user_sat_gt_settings").select("nit, portal_login, portal_password").eq("user_id", user.id).maybeSingle(),
    ])

  if (!membership || !project) notFound()

  const catsRaw = categories || []
  const catById = new Map(catsRaw.map((c) => [c.id, c]))
  const leafCats = leafCategories(catsRaw as { id: string; parent_id?: string | null }[])
  const categoryOptions = leafCats.map((c) => {
    const row = c as { id: string; name: string; parent_id?: string | null }
    const parent = row.parent_id ? (catById.get(row.parent_id) as { name?: string } | undefined) : undefined
    return {
      value: row.id,
      label: parent?.name ? `${parent.name} — ${row.name}` : row.name,
    }
  })

  const expenseTypeOptions = (txTypes || []).filter((t) => t.type === "expense").map((t) => ({ value: t.id, label: t.name }))
  const incomeTypeOptions = (txTypes || []).filter((t) => t.type === "income").map((t) => ({ value: t.id, label: t.name }))

  const canImport = membership.role !== "observer" && project.status !== "archived"
  const nitOk = !!(sat?.nit?.trim() || sat?.portal_login?.trim())
  const profileSatConfigured = nitOk && !!sat?.portal_password

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-800/20 bg-emerald-50/40 px-4 py-3">
        <Image
          src="/branding/sat-guatemala-logo.png"
          alt="SAT Guatemala"
          width={200}
          height={56}
          className="h-10 w-auto max-w-[220px] object-contain object-left"
        />
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Importación SAT (FEL)</h2>
          <p className="text-xs text-gray-600">
            Las credenciales las guardas en{" "}
            <Link href="/profile" className="text-indigo-600 hover:underline">
              Mi perfil
            </Link>
            . La app inicia sesión en el portal y consulta DTE emitidos y recibidos en el rango indicado (mismo enfoque
            técnico que integraciones RPA con Puppeteer).
          </p>
        </div>
      </div>
      <SatImportPanel
        projectId={id}
        currency={project.currency || "GTQ"}
        categoryOptions={categoryOptions}
        expenseTypeOptions={expenseTypeOptions}
        incomeTypeOptions={incomeTypeOptions}
        canImport={canImport}
        profileSatConfigured={profileSatConfigured}
      />
    </div>
  )
}
