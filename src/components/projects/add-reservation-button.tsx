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
import { formatSupabaseError } from "@/lib/utils"

export function AddReservationButton({
  projectId,
  categoryOptions,
  readOnly,
}: {
  projectId: string
  categoryOptions: { value: string; label: string }[]
  readOnly?: boolean
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    title: "",
    category_id: "",
    reserved_amount: "",
    details: "",
  })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim() || !form.category_id || !form.reserved_amount) {
      toast("error", "Completa título, renglón y monto comprometido")
      return
    }
    setLoading(true)
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }
    const { error } = await supabase.from("project_reservations").insert({
      project_id: projectId,
      category_id: form.category_id,
      title: form.title.trim(),
      reserved_amount: Number(form.reserved_amount),
      details: form.details.trim() || null,
      created_by: user.id,
    })
    if (error) {
      toast("error", formatSupabaseError(error, "No se pudo crear el compromiso"))
    } else {
      toast("success", "Compromiso creado")
      setOpen(false)
      setForm({ title: "", category_id: "", reserved_amount: "", details: "" })
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)} disabled={!!readOnly}>
        <Plus className="h-3.5 w-3.5" />
        Nuevo compromiso
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Crear compromiso" size="lg">
        <form onSubmit={submit} className="space-y-4 p-6">
          <Input
            label="Título del compromiso *"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Ej. Compra de acero fase 1"
            required
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Renglón / categoría *"
              options={categoryOptions}
              value={form.category_id}
              onChange={(e) => setForm({ ...form, category_id: e.target.value })}
              required
            />
            <Input
              label="Monto comprometido *"
              type="number"
              min="0.01"
              step="0.01"
              value={form.reserved_amount}
              onChange={(e) => setForm({ ...form, reserved_amount: e.target.value })}
              placeholder="0.00"
              required
            />
          </div>
          <Textarea
            label="Detalles"
            value={form.details}
            onChange={(e) => setForm({ ...form, details: e.target.value })}
            placeholder="Notas de alcance, proveedor previsto, etc."
          />
          <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={loading}>
              Guardar compromiso
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
