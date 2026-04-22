"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { Check, X, UserMinus } from "lucide-react"

interface Props {
  companionId: string
  action: "respond" | "remove"
}

export function CompanionActions({ companionId, action }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState<string | null>(null)

  const respond = async (status: "accepted" | "rejected") => {
    setLoading(status)
    const supabase = createClient()
    await supabase.from("companions").update({ status }).eq("id", companionId)
    toast("success", status === "accepted" ? "Solicitud aceptada" : "Solicitud rechazada")
    setLoading(null)
    router.refresh()
  }

  const remove = async () => {
    if (!confirm("¿Remover este compañero?")) return
    setLoading("remove")
    const supabase = createClient()
    await supabase.from("companions").delete().eq("id", companionId)
    toast("success", "Compañero removido")
    setLoading(null)
    router.refresh()
  }

  if (action === "respond") {
    return (
      <div className="flex gap-2">
        <Button size="sm" loading={loading === "accepted"} onClick={() => respond("accepted")}>
          <Check className="h-3.5 w-3.5" /> Aceptar
        </Button>
        <Button size="sm" variant="ghost" loading={loading === "rejected"} onClick={() => respond("rejected")}>
          <X className="h-3.5 w-3.5" /> Rechazar
        </Button>
      </div>
    )
  }

  return (
    <button
      onClick={remove}
      disabled={loading === "remove"}
      className="text-gray-300 hover:text-red-400 transition-colors p-1 disabled:opacity-50"
      title="Remover compañero"
    >
      <UserMinus className="h-4 w-4" />
    </button>
  )
}
