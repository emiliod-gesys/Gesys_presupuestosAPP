"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Modal } from "@/components/ui/modal"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { Plus } from "lucide-react"

interface Props {
  projectId: string
  categories: { value: string; label: string }[]
  txTypes: { value: string; label: string; type: string }[]
}

export function AddTransactionButton({ projectId, categories, txTypes }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    description: "",
    amount: "",
    date: new Date().toISOString().split("T")[0],
    transaction_type_id: "",
    category_id: "",
    reference_number: "",
    notes: "",
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.description || !form.amount || !form.transaction_type_id || !form.date) {
      toast("error", "Completa los campos requeridos")
      return
    }
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from("transactions").insert({
      project_id: projectId,
      description: form.description,
      amount: parseFloat(form.amount),
      date: form.date,
      transaction_type_id: form.transaction_type_id,
      category_id: form.category_id || null,
      reference_number: form.reference_number || null,
      notes: form.notes || null,
      created_by: user.id,
    })

    if (error) {
      toast("error", "Error al registrar la transacción")
    } else {
      toast("success", "Transacción registrada")
      setOpen(false)
      setForm({
        description: "", amount: "",
        date: new Date().toISOString().split("T")[0],
        transaction_type_id: "", category_id: "", reference_number: "", notes: "",
      })
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" /> Nueva transacción
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Registrar transacción" size="lg">
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Tipo de transacción *"
              options={txTypes}
              placeholder="Selecciona..."
              value={form.transaction_type_id}
              onChange={(e) => setForm({ ...form, transaction_type_id: e.target.value })}
              required
            />
            <Input
              label="Fecha *"
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              required
            />
          </div>
          <Input
            label="Descripción *"
            placeholder="Descripción de la transacción"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            required
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Monto *"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              required
            />
            <Select
              label="Renglón / Categoría"
              options={categories}
              placeholder="Sin categoría"
              value={form.category_id}
              onChange={(e) => setForm({ ...form, category_id: e.target.value })}
            />
          </div>
          <Input
            label="Número de referencia"
            placeholder="Ej: FAC-001"
            value={form.reference_number}
            onChange={(e) => setForm({ ...form, reference_number: e.target.value })}
          />
          <Textarea
            label="Notas"
            placeholder="Observaciones adicionales..."
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" loading={loading}>Registrar</Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
