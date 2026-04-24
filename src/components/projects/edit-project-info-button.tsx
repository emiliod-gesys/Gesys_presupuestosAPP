"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Modal } from "@/components/ui/modal"
import { useToast } from "@/components/ui/toast"
import { Pencil } from "lucide-react"

function toDateInputValue(d: string) {
  if (!d) return ""
  return d.slice(0, 10)
}

export function EditProjectInfoButton({
  projectId,
  initial,
}: {
  projectId: string
  initial: { client: string; location: string; start_date: string; end_date: string }
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [client, setClient] = useState("")
  const [location, setLocation] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  useEffect(() => {
    if (!open) return
    setClient(initial.client || "")
    setLocation(initial.location || "")
    setStartDate(toDateInputValue(initial.start_date))
    setEndDate(toDateInputValue(initial.end_date))
  }, [open, initial.client, initial.location, initial.start_date, initial.end_date])

  const save = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client,
          location,
          start_date: startDate,
          end_date: endDate,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast("error", (data as { error?: string }).error || "No se pudo guardar")
        return
      }
      toast("success", "Información actualizada")
      setOpen(false)
      router.refresh()
    } catch {
      toast("error", "Error de red")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto" onClick={() => setOpen(true)}>
        <Pencil className="h-4 w-4" />
        Editar información
      </Button>
      <Modal open={open} onClose={() => !loading && setOpen(false)} title="Información del proyecto" size="md">
        <div className="space-y-4 px-4 py-4 sm:px-6">
          <Input label="Cliente" value={client} onChange={(e) => setClient(e.target.value)} placeholder="Nombre del cliente" />
          <Input
            label="Ubicación"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Ciudad, departamento…"
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Fecha de inicio" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <Input label="Fecha de fin" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="button" loading={loading} onClick={save}>
              Guardar
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
