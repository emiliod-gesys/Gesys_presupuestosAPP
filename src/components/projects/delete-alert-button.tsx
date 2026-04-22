"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/components/ui/toast"
import { Trash2 } from "lucide-react"

export function DeleteAlertButton({ alertId }: { alertId: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  const handleDelete = async () => {
    if (!confirm("¿Eliminar esta alerta?")) return
    setLoading(true)
    const supabase = createClient()
    await supabase.from("budget_alerts").delete().eq("id", alertId)
    toast("success", "Alerta eliminada")
    setLoading(false)
    router.refresh()
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="text-gray-300 hover:text-red-400 transition-colors disabled:opacity-50"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  )
}
