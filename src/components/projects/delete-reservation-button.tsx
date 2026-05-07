"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/components/ui/toast"
import { Trash2 } from "lucide-react"

export function DeleteReservationButton({
  reservationId,
  title,
}: {
  reservationId: string
  title: string
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  const remove = async () => {
    if (!confirm(`¿Eliminar la reserva "${title}"? Las transacciones relacionadas se conservarán.`)) return
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.from("project_reservations").delete().eq("id", reservationId)
    if (error) {
      toast("error", error.message || "No se pudo eliminar la reserva")
      setLoading(false)
      return
    }
    toast("success", "Reserva eliminada")
    setLoading(false)
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={() => void remove()}
      disabled={loading}
      className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
      title="Eliminar reserva"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  )
}
