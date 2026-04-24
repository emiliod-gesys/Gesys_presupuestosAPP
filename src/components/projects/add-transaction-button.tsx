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
import { cn, formatSupabaseError } from "@/lib/utils"

interface Props {
  projectId: string
  categories: { value: string; label: string }[]
  txTypes: { value: string; label: string; type: string }[]
  className?: string
  /** Proyecto archivado: no permitir registrar movimientos */
  readOnly?: boolean
}

export function AddTransactionButton({ projectId, categories, txTypes, className, readOnly }: Props) {
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
    vendor: "",
    attachment_url: "",
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
      vendor: form.vendor.trim() || null,
      attachment_url: form.attachment_url.trim() || null,
      notes: form.notes || null,
      created_by: user.id,
    })

    if (error) {
      toast("error", formatSupabaseError(error, "Error al registrar la transacción"))
    } else {
      toast("success", "Transacción registrada")
      setOpen(false)
      setForm({
        description: "",
        amount: "",
        date: new Date().toISOString().split("T")[0],
        transaction_type_id: "",
        category_id: "",
        reference_number: "",
        vendor: "",
        attachment_url: "",
        notes: "",
      })
      router.refresh()
    }
    setLoading(false)
  }

  if (readOnly) {
    return (
      <Button size="sm" variant="outline" className={cn("w-full cursor-not-allowed opacity-60 sm:w-auto", className)} disabled type="button" title="Proyecto archivado">
        <Plus className="h-3.5 w-3.5" /> Solo consulta
      </Button>
    )
  }

  return (
    <>
      <Button size="sm" className={cn("w-full sm:w-auto", className)} onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" /> Nueva transacción
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Registrar transacción" size="lg">
        <form onSubmit={handleSubmit} className="space-y-4 p-4 sm:p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          <Input
            label="Proveedor / contratista"
            placeholder="Opcional"
            value={form.vendor}
            onChange={(e) => setForm({ ...form, vendor: e.target.value })}
          />
          <Input
            label="URL de adjunto (factura, Drive, etc.)"
            placeholder="https://..."
            value={form.attachment_url}
            onChange={(e) => setForm({ ...form, attachment_url: e.target.value })}
          />
          <Textarea
            label="Notas"
            placeholder="Observaciones adicionales..."
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end sm:gap-3">
            <Button type="button" variant="ghost" className="w-full sm:w-auto" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" className="w-full sm:w-auto" loading={loading}>
              Registrar
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
