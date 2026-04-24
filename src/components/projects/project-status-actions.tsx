"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { CheckCircle, Archive, RotateCcw, ChevronDown, type LucideIcon } from "lucide-react"

interface Props {
  projectId: string
  currentStatus: string
}

export function ProjectStatusActions({ projectId, currentStatus }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const changeStatus = async (status: string) => {
    setLoading(true)
    setOpen(false)
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const reactivating = currentStatus === "archived" && status === "active"

    if (reactivating) {
      const { error } = await supabase
        .from("projects")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", projectId)
      if (error) {
        toast("error", error.message || "No se pudo reactivar el proyecto")
        setLoading(false)
        return
      }
      if (user) {
        await supabase.from("project_logs").insert({
          project_id: projectId,
          user_id: user.id,
          action: "status_changed",
          details: { from: currentStatus, to: status },
        })
      }
    } else {
      if (user) {
        const { error: logErr } = await supabase.from("project_logs").insert({
          project_id: projectId,
          user_id: user.id,
          action: "status_changed",
          details: { from: currentStatus, to: status },
        })
        if (logErr) {
          toast("error", logErr.message || "No se pudo registrar el cambio de estado")
          setLoading(false)
          return
        }
      }
      const { error } = await supabase
        .from("projects")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", projectId)
      if (error) {
        toast("error", error.message || "No se pudo actualizar el estado")
        setLoading(false)
        return
      }
    }

    toast("success", "Estado del proyecto actualizado")
    setLoading(false)
    router.refresh()
  }

  type StatusOpt = { status: string; label: string; icon: LucideIcon }

  const options: StatusOpt[] =
    currentStatus === "archived"
      ? [{ status: "active", label: "Volver a activo", icon: RotateCcw }]
      : [
          ...(currentStatus !== "active"
            ? [{ status: "active", label: "Marcar como activo", icon: RotateCcw }]
            : []),
          ...(currentStatus !== "completed"
            ? [{ status: "completed", label: "Marcar como completado", icon: CheckCircle }]
            : []),
          ...(currentStatus !== "archived"
            ? [{ status: "archived", label: "Archivar proyecto", icon: Archive }]
            : []),
        ]

  return (
    <div className="relative">
      <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={() => setOpen(!open)} loading={loading}>
        Cambiar estado <ChevronDown className="h-3.5 w-3.5" />
      </Button>
      {open && (
        <div className="absolute left-0 top-9 z-10 min-w-[200px] rounded-xl border border-gray-200 bg-white py-1 shadow-lg sm:left-auto sm:right-0">
          {options.map(({ status, label, icon: Icon }) => (
            <button
              key={status}
              onClick={() => changeStatus(status)}
              className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Icon className="h-4 w-4 text-gray-400" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
