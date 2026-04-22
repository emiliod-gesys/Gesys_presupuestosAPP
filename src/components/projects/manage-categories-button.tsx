"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
  toDelete?: boolean
}

export function ManageCategoriesButton({ projectId, categories }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<CategoryRow[]>(() =>
    categories.map((c) => ({
      id: c.id,
      isNew: false,
      name: c.name,
      description: c.description || "",
      budget_amount: String(c.budget_amount),
      order_index: c.order_index,
    }))
  )

  const add = () => setRows([...rows, {
    id: `new-${Date.now()}`,
    isNew: true,
    name: "",
    description: "",
    budget_amount: "",
    order_index: rows.length,
  }])

  const remove = (id: string) => {
    setRows(rows.map((r) => r.id === id ? { ...r, toDelete: true } : r))
  }

  const update = (id: string, field: keyof CategoryRow, value: string) => {
    setRows(rows.map((r) => r.id === id ? { ...r, [field]: value } : r))
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
      await supabase.from("budget_categories").update({
        name: r.name,
        description: r.description || null,
        budget_amount: parseFloat(r.budget_amount) || 0,
        order_index: r.order_index,
      }).eq("id", r.id)
    }

    if (toInsert.length) {
      await supabase.from("budget_categories").insert(
        toInsert.map((r) => ({
          project_id: projectId,
          name: r.name,
          description: r.description || null,
          budget_amount: parseFloat(r.budget_amount) || 0,
          order_index: r.order_index,
        }))
      )
    }

    // Update project total_budget
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
        <div className="p-6 space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500">Presupuesto total: <strong>{new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ" }).format(total)}</strong></p>
            <Button type="button" size="sm" variant="outline" onClick={add}>
              <Plus className="h-3.5 w-3.5" /> Agregar renglón
            </Button>
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto">
            {visible.map((r, idx) => (
              <div key={r.id} className="flex gap-3 items-start p-3 bg-gray-50 rounded-lg">
                <div className="flex-1 grid grid-cols-2 gap-3">
                  <Input
                    placeholder={`Renglón ${idx + 1}`}
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
                  className="text-gray-300 hover:text-red-400 mt-2"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} loading={loading}>
              <Save className="h-4 w-4" /> Guardar cambios
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
