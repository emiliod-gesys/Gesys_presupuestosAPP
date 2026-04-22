"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Modal } from "@/components/ui/modal"
import { useToast } from "@/components/ui/toast"
import { Plus } from "lucide-react"

interface Props {
  projectId: string
  categories: { value: string; label: string }[]
}

export function CreateAlertButton({ projectId, categories }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [categoryId, setCategoryId] = useState("")
  const [threshold, setThreshold] = useState("75")

  const handleCreate = async () => {
    if (!categoryId || !threshold) {
      toast("error", "Selecciona un renglón y define el porcentaje")
      return
    }
    const pct = parseFloat(threshold)
    if (pct <= 0 || pct > 100) {
      toast("error", "El porcentaje debe estar entre 1 y 100")
      return
    }
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from("budget_alerts").insert({
      project_id: projectId,
      category_id: categoryId,
      threshold_percentage: pct,
      created_by: user.id,
    })

    if (error) {
      toast("error", "Error al crear la alerta")
    } else {
      await supabase.from("project_logs").insert({
        project_id: projectId,
        user_id: user.id,
        action: "alert_created",
        details: { category_id: categoryId, threshold: pct },
      })
      toast("success", "Alerta creada")
      setOpen(false)
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" /> Nueva alerta
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Configurar alerta de presupuesto">
        <div className="p-6 space-y-4">
          <Select
            label="Renglón a monitorear *"
            options={categories}
            placeholder="Selecciona un renglón..."
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          />
          <Input
            label="Porcentaje de alerta *"
            type="number"
            min="1"
            max="100"
            step="1"
            placeholder="Ej: 75"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            helperText="La notificación se enviará cuando el gasto alcance este porcentaje del presupuesto asignado al renglón."
          />
          <div className="flex gap-2 flex-wrap">
            {["50", "75", "90", "100"].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setThreshold(p)}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                  threshold === p ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-300 text-gray-600 hover:border-indigo-400"
                }`}
              >
                {p}%
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} loading={loading}>Crear alerta</Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
