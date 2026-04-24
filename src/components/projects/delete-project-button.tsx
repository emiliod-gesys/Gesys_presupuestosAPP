"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/modal"
import { useToast } from "@/components/ui/toast"
import { Trash2 } from "lucide-react"

export function DeleteProjectButton({ projectId, projectName }: { projectId: string; projectName: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const onDelete = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE", credentials: "include" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const d = data as { error?: string; hint?: string; code?: string }
        const extra = d.hint ? ` ${d.hint}` : d.code ? ` (${d.code})` : ""
        toast("error", (d.error || "No se pudo eliminar el proyecto") + extra)
        return
      }
      toast("success", "Proyecto eliminado")
      setOpen(false)
      router.push("/dashboard")
      router.refresh()
    } catch {
      toast("error", "Error de red")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="w-full border-red-200 text-red-700 hover:bg-red-50 sm:w-auto" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4" />
        Eliminar proyecto
      </Button>
      <Modal open={open} onClose={() => !loading && setOpen(false)} title="Eliminar proyecto" size="md">
        <div className="space-y-4 px-4 py-4 sm:px-6">
          <p className="text-sm text-gray-600">
            Vas a eliminar <strong className="text-gray-900">{projectName}</strong>. Se borrarán presupuestos,
            transacciones, miembros e historial vinculados a este proyecto. Esta acción no se puede deshacer.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="button" variant="danger" loading={loading} onClick={onDelete}>
              Eliminar definitivamente
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
