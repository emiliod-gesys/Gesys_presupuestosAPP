"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/components/ui/toast"
import { Trash2 } from "lucide-react"

export function DeleteTransactionButton({ transactionId }: { transactionId: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  const handleDelete = async () => {
    if (!confirm("¿Eliminar esta transacción? Esta acción quedará registrada en el historial.")) return
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.from("transactions").delete().eq("id", transactionId)
    if (error) {
      toast("error", "Error al eliminar la transacción")
    } else {
      toast("success", "Transacción eliminada")
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="text-gray-300 hover:text-red-400 transition-colors disabled:opacity-50"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  )
}
