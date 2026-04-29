"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Modal } from "@/components/ui/modal"
import { useToast } from "@/components/ui/toast"
import { Link2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface Props {
  projectId: string
  projectName: string
  currentFamilyId: string | null
  currentFamilyName: string | null
}

type FamilyRow = { id: string; name: string }

export function CreateSiblingProjectButton({
  projectId,
  projectName,
  currentFamilyId,
  currentFamilyName,
}: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<"new" | "existing">("new")
  const [familyName, setFamilyName] = useState("")
  const [existingFamilyId, setExistingFamilyId] = useState("")
  const [newProjectName, setNewProjectName] = useState("")
  const [families, setFamilies] = useState<FamilyRow[]>([])

  useEffect(() => {
    if (!open) return
    setNewProjectName(`${projectName} (hermano)`)
    setFamilyName(`${projectName} — familia`)
    setMode(currentFamilyId ? "existing" : "new")
    setExistingFamilyId(currentFamilyId || "")
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      const { data } = await supabase.from("project_families").select("id, name").order("name")
      if (!cancelled) setFamilies((data as FamilyRow[]) || [])
    })()
    return () => {
      cancelled = true
    }
  }, [open, projectName, currentFamilyId])

  const submit = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/sibling`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          family_name: mode === "new" ? familyName.trim() : undefined,
          family_id: mode === "existing" ? existingFamilyId : undefined,
          new_project_name: newProjectName.trim() || undefined,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; id?: string }
      if (!res.ok) {
        toast("error", data.error || "No se pudo crear el proyecto hermano")
        return
      }
      if (data.id) {
        toast("success", "Proyecto hermano creado")
        setOpen(false)
        router.push(`/projects/${data.id}`)
        router.refresh()
      }
    } catch {
      toast("error", "Error de red")
    } finally {
      setLoading(false)
    }
  }

  const canSubmit =
    mode === "new"
      ? familyName.trim().length > 0 && newProjectName.trim().length > 0
      : !!existingFamilyId && newProjectName.trim().length > 0

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto" onClick={() => setOpen(true)}>
        <Link2 className="h-4 w-4" />
        Crear proyecto hermano
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Crear proyecto hermano" size="lg">
        <div className="space-y-4 p-6">
          <p className="text-sm text-gray-600">
            Se copiará la estructura de presupuesto (categorías y montos) del proyecto actual. Las transacciones no se
            copian. Elige una familia para poder comparar proyectos relacionados.
          </p>

          <Input
            label="Nombre del nuevo proyecto"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            placeholder="Ej. Obra fase 2"
          />

          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-700">Familia de proyectos</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setMode("new")}
                className={cn(
                  "rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                  mode === "new"
                    ? "border-indigo-500 bg-indigo-50 text-indigo-800"
                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                )}
              >
                Nueva familia
              </button>
              <button
                type="button"
                onClick={() => setMode("existing")}
                className={cn(
                  "rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                  mode === "existing"
                    ? "border-indigo-500 bg-indigo-50 text-indigo-800"
                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                )}
              >
                Familia existente
              </button>
            </div>
          </div>

          {mode === "new" ? (
            <Input
              label="Nombre de la nueva familia"
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              placeholder="Ej. Complejo habitacional Norte"
            />
          ) : (
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700" htmlFor="sibling-family-select">
                Familia existente
              </label>
              <select
                id="sibling-family-select"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                value={existingFamilyId}
                onChange={(e) => setExistingFamilyId(e.target.value)}
              >
                <option value="">— Selecciona —</option>
                {families.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                    {currentFamilyId === f.id ? " (actual del proyecto)" : ""}
                  </option>
                ))}
              </select>
              {currentFamilyId && currentFamilyName && (
                <p className="text-xs text-gray-500">
                  Este proyecto ya está en «{currentFamilyName}». Puedes seguir añadiendo hermanos a la misma familia.
                </p>
              )}
              {families.length === 0 && (
                <p className="text-xs text-amber-700">No hay familias aún. Crea una familia nueva primero.</p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" loading={loading} disabled={!canSubmit} onClick={() => void submit()}>
              Crear hermano
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
