"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Modal } from "@/components/ui/modal"
import { useToast } from "@/components/ui/toast"
import { Settings, Plus, Trash2, Save } from "lucide-react"
import type { BudgetCategory } from "@/lib/types"

interface Props {
  projectId: string
  categories: BudgetCategory[]
}

interface CategoryRow {
  id: string
  isNew: boolean
  name: string
  description: string
  budget_amount: string
  order_index: number
  /** Id de categoría padre; vacío = renglón en raíz. */
  parent_id: string
  toDelete?: boolean
}

function rowsFromCategories(cats: BudgetCategory[]): CategoryRow[] {
  return cats.map((c) => ({
    id: c.id,
    isNew: false,
    name: c.name,
    description: c.description || "",
    budget_amount: String(c.budget_amount),
    order_index: c.order_index,
    parent_id: c.parent_id ?? "",
  }))
}

export function ManageCategoriesButton({ projectId, categories }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<CategoryRow[]>(() => rowsFromCategories(categories))

  const categoriesKey = categories.map((c) => c.id).join(",")
  useEffect(() => {
    if (open) setRows(rowsFromCategories(categories))
    // categoriesKey evita resetear al editar; categories al abrir debe ser la última versión.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sincronizar al abrir modal o al cambiar ids
  }, [open, categoriesKey])

  const add = () =>
    setRows((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        isNew: true,
        name: "",
        description: "",
        budget_amount: "",
        order_index: prev.filter((r) => !r.toDelete).length,
        parent_id: "",
      },
    ])

  const remove = (id: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, toDelete: true } : r)))
  }

  const update = (id: string, field: keyof CategoryRow, value: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)))
  }

  const save = async () => {
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const toDelete = rows.filter((r) => !r.isNew && r.toDelete).map((r) => r.id)
    const toUpdate = rows.filter((r) => !r.isNew && !r.toDelete)
    const toInsert = rows.filter((r) => r.isNew && !r.toDelete && r.name.trim())

    if (toDelete.length) {
      await supabase.from("budget_categories").delete().in("id", toDelete)
    }

    for (const r of toUpdate) {
      await supabase
        .from("budget_categories")
        .update({
          name: r.name,
          description: r.description || null,
          budget_amount: parseFloat(r.budget_amount) || 0,
          order_index: r.order_index,
          parent_id: r.parent_id || null,
        })
        .eq("id", r.id)
    }

    if (toInsert.length) {
      const existingIds = new Set(rows.filter((r) => !r.isNew && !r.toDelete).map((r) => r.id))
      const tempToReal = new Map<string, string>()
      const pool = [...toInsert]
      const maxOrder = Math.max(0, ...rows.filter((r) => !r.toDelete).map((r) => r.order_index))
      let orderCounter = maxOrder + 1
      let guard = 0
      while (pool.length && guard < 400) {
        guard += 1
        const idx = pool.findIndex((r) => {
          if (!r.parent_id) return true
          return existingIds.has(r.parent_id) || tempToReal.has(r.parent_id)
        })
        if (idx === -1) {
          toast("error", "Revisa las categorías padre: hay referencias circulares o un padre que aún no existe.")
          setLoading(false)
          return
        }
        const r = pool.splice(idx, 1)[0]
        let parentResolved: string | null = null
        if (r.parent_id) {
          if (tempToReal.has(r.parent_id)) parentResolved = tempToReal.get(r.parent_id)!
          else if (existingIds.has(r.parent_id)) parentResolved = r.parent_id
        }
        const { data: created, error: insErr } = await supabase
          .from("budget_categories")
          .insert({
            project_id: projectId,
            name: r.name.trim(),
            description: r.description || null,
            budget_amount: parseFloat(r.budget_amount) || 0,
            parent_id: parentResolved,
            order_index: orderCounter++,
          })
          .select("id")
          .single()
        if (insErr || !created?.id) {
          toast("error", insErr?.message || "Error al insertar renglón")
          setLoading(false)
          return
        }
        tempToReal.set(r.id, created.id as string)
        existingIds.add(created.id as string)
      }
    }

    const totalBudget = rows
      .filter((r) => !r.toDelete && r.name.trim())
      .reduce((s, r) => s + (parseFloat(r.budget_amount) || 0), 0)
    await supabase.from("projects").update({ total_budget: totalBudget }).eq("id", projectId)

    if (user) {
      await supabase.from("project_logs").insert({
        project_id: projectId,
        user_id: user.id,
        action: "category_updated",
        details: { total_budget: totalBudget },
      })
    }

    toast("success", "Renglones actualizados")
    setLoading(false)
    setOpen(false)
    router.refresh()
  }

  const visible = rows.filter((r) => !r.toDelete)
  const total = visible.reduce((s, r) => s + (parseFloat(r.budget_amount) || 0), 0)

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Settings className="h-3.5 w-3.5" /> Gestionar renglones
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Gestionar renglones de presupuesto" size="xl">
        <div className="space-y-4 p-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <p className="text-sm text-gray-500">
              Presupuesto total:{" "}
              <strong>
                {new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ" }).format(total)}
              </strong>
            </p>
            <Button type="button" size="sm" variant="outline" onClick={add}>
              <Plus className="h-3.5 w-3.5" /> Agregar renglón
            </Button>
          </div>
          <p className="text-xs text-gray-500">
            Usa <span className="font-medium">Dentro de</span> para agrupar renglones bajo una categoría (ej. categoría
            &quot;Materiales&quot; con monto 0 y renglones hijos con montos reales).
          </p>

          <div className="max-h-96 space-y-3 overflow-y-auto">
            {visible.map((r, idx) => (
              <div key={r.id} className="flex flex-col gap-3 rounded-lg bg-gray-50 p-3 sm:flex-row sm:items-start">
                <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input
                    placeholder={`Nombre ${idx + 1}`}
                    value={r.name}
                    onChange={(e) => update(r.id, "name", e.target.value)}
                  />
                  <Input
                    placeholder="Monto asignado"
                    type="number"
                    min="0"
                    step="0.01"
                    value={r.budget_amount}
                    onChange={(e) => update(r.id, "budget_amount", e.target.value)}
                  />
                  <Select
                    className="col-span-2 sm:col-span-1"
                    label="Dentro de (categoría padre)"
                    options={[
                      { value: "", label: "— Ninguna (primer nivel) —" },
                      ...visible
                        .filter((x) => x.id !== r.id)
                        .map((x) => ({
                          value: x.id,
                          label: x.name.trim() || "(sin nombre)",
                        })),
                    ]}
                    value={r.parent_id}
                    onChange={(e) => update(r.id, "parent_id", e.target.value)}
                  />
                  <Input
                    className="col-span-2"
                    placeholder="Descripción (opcional)"
                    value={r.description}
                    onChange={(e) => update(r.id, "description", e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => remove(r.id)}
                  className="mt-2 self-end text-gray-300 hover:text-red-400 sm:self-start"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-3 border-t pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save} loading={loading}>
              <Save className="h-4 w-4" /> Guardar cambios
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
