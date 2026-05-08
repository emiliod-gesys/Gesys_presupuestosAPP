import Image from "next/image"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import { OdooImportPanel } from "@/components/projects/odoo-import-panel"
import { leafCategories } from "@/lib/budget-category-tree"

export default async function ProjectOdooPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const [{ data: membership }, { data: project }, { data: categories }, { data: txTypes }, { data: odoo }] =
    await Promise.all([
      supabase.from("project_members").select("role").eq("project_id", id).eq("user_id", user.id).single(),
      supabase.from("projects").select("currency, status").eq("id", id).single(),
      supabase.from("budget_categories").select("id, name, parent_id").eq("project_id", id).order("order_index"),
      supabase.from("transaction_types").select("id, name, type").order("name"),
      supabase
        .from("user_odoo_settings")
        .select("odoo_url, odoo_database, odoo_login, odoo_password")
        .eq("user_id", user.id)
        .maybeSingle(),
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

  const expenseTypeOptions = (txTypes || [])
    .filter((t) => t.type === "expense")
    .map((t) => ({ value: t.id, label: t.name }))
  const incomeTypeOptions = (txTypes || [])
    .filter((t) => t.type === "income")
    .map((t) => ({ value: t.id, label: t.name }))

  const canImport = membership.role !== "observer" && project.status !== "archived"
  const profileOdooConfigured = !!(odoo?.odoo_url && odoo?.odoo_login && odoo?.odoo_password)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#875A7B]/20 bg-[#875A7B]/5 px-4 py-3">
        <Image src="/branding/odoo-logo.svg" alt="Odoo" width={88} height={28} className="h-7 w-auto" />
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Importación Odoo</h2>
          <p className="text-xs text-gray-600">
            Las credenciales las guardas en{" "}
            <Link href="/profile" className="text-indigo-600 hover:underline">
              Mi perfil
            </Link>
            . La app se conecta con la API JSON-RPC de tu instancia (ruta estándar{" "}
            <code className="rounded bg-white/80 px-1 text-[11px]">/jsonrpc</code>
            ) usando la base de datos, el usuario y la contraseña, según la{" "}
            <a
              href="https://www.odoo.com/documentation/master/developer/reference/external_api.html"
              className="text-indigo-600 hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              documentación externa de Odoo
            </a>
            .
          </p>
        </div>
      </div>
      <OdooImportPanel
        projectId={id}
        currency={project.currency || "GTQ"}
        categoryOptions={categoryOptions}
        expenseTypeOptions={expenseTypeOptions}
        incomeTypeOptions={incomeTypeOptions}
        canImport={canImport}
        profileOdooConfigured={profileOdooConfigured}
      />
    </div>
  )
}
