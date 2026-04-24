"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { Check, X } from "lucide-react"

interface Props {
  invitationId: string
  projectId: string
}

export function InvitationActions({ invitationId, projectId }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState<"accept" | "reject" | null>(null)
  const [done, setDone] = useState(false)

  const respond = async (action: "accept" | "reject") => {
    setLoading(action)
    const supabase = createClient()
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser()

    const { data: inv } = await supabase
      .from("project_invitations")
      .select("*")
      .eq("id", invitationId)
      .single()

    if (!inv) {
      toast("error", "Invitación no encontrada")
      setLoading(null)
      return
    }

    await supabase
      .from("project_invitations")
      .update({ status: action === "accept" ? "accepted" : "rejected" })
      .eq("id", invitationId)

    if (action === "accept") {
      if (currentUser) {
        await supabase.from("project_members").insert({
          project_id: inv.project_id,
          user_id: currentUser.id,
          role: inv.role,
          invited_by: inv.inviter_id,
        })
        await supabase.from("project_logs").insert({
          project_id: inv.project_id,
          user_id: currentUser.id,
          action: "member_joined",
          details: { role: inv.role },
        })
      }
      toast("success", "Te has unido al proyecto")
    } else {
      toast("success", "Invitación rechazada")
    }

    if (currentUser) {
      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", currentUser.id)
        .eq("project_id", inv.project_id)
        .eq("type", "project_invitation")
    }

    setDone(true)
    router.refresh()
  }

  if (done) return null

  return (
    <div className="flex gap-2">
      <Button size="sm" variant="primary" loading={loading === "accept"} onClick={() => respond("accept")}>
        <Check className="h-3.5 w-3.5" /> Aceptar
      </Button>
      <Button size="sm" variant="ghost" loading={loading === "reject"} onClick={() => respond("reject")}>
        <X className="h-3.5 w-3.5" /> Rechazar
      </Button>
    </div>
  )
}
