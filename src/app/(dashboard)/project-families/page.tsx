import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"
import Link from "next/link"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { StatusBadge } from "@/components/ui/badge"
import { formatCurrency } from "@/lib/utils"
import { Network } from "lucide-react"

type ProjectRow = {
  id: string
  name: string
  status: string
  total_budget: number
  currency: string
}

export default async function ProjectFamiliesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: families } = await supabase
    .from("project_families")
    .select("id, name, created_at, projects(id, name, status, total_budget, currency)")
    .order("name")

  const list = families || []

  return (
    <div className="mx-auto max-w-4xl space-y-6 animate-in">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900 sm:text-2xl">
            <Network className="h-6 w-6 shrink-0 text-teal-600" aria-hidden />
            Familias de proyectos
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Agrupa proyectos hermanos para comparar presupuestos y ejecución. Crea un hermano desde el resumen de un
            proyecto.
          </p>
        </div>
      </div>

      {list.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-gray-500">
            Aún no hay familias. Como administrador de un proyecto, usa{" "}
            <span className="font-medium text-gray-700">Crear proyecto hermano</span> en el resumen del proyecto y
            define una familia nueva o elige una existente.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-4">
          {list.map((f) => {
            const raw = f.projects as ProjectRow[] | ProjectRow | null | undefined
            const projects = Array.isArray(raw) ? raw : raw ? [raw] : []
            return (
              <li key={f.id}>
                <Card>
                  <CardHeader>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h2 className="text-base font-semibold text-gray-900">{f.name}</h2>
                        <p className="text-xs text-gray-500">{projects.length} proyecto(s) en la familia</p>
                      </div>
                      <Link
                        href={`/project-families/${f.id}`}
                        className="shrink-0 text-sm font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
                      >
                        Comparar →
                      </Link>
                    </div>
                  </CardHeader>
                  <CardContent className="border-t border-gray-50 pt-4">
                    <ul className="space-y-2">
                      {projects.map((p) => (
                        <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <Link href={`/projects/${p.id}`} className="font-medium text-gray-900 hover:text-indigo-600">
                            {p.name}
                          </Link>
                          <div className="flex items-center gap-2">
                            <StatusBadge status={p.status} />
                            <span className="text-xs text-gray-500">
                              {formatCurrency(Number(p.total_budget) || 0, p.currency || "GTQ")}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
