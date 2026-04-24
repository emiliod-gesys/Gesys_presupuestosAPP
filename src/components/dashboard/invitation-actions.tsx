"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { Check, X } from "lucide-react"

interface Props {
  invitationId: string
}

export function InvitationActions({ invitationId }: Props) {
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

    const { data: inv, error: invFetchErr } = await supabase
      .from("project_invitations")
      .select("*")
      .eq("id", invitationId)
      .single()

    if (invFetchErr || !inv) {
      toast("error", "Invitación no encontrada")
      setLoading(null)
      return
    }

    if (inv.status !== "pending") {
      toast("error", "Esta invitación ya no está pendiente")
      setLoading(null)
      return
    }

    if (action === "reject") {
      const { error } = await supabase
        .from("project_invitations")
        .update({ status: "rejected" })
        .eq("id", invitationId)
        .eq("status", "pending")

      if (error) {
        toast("error", error.message || "No se pudo rechazar la invitación")
        setLoading(null)
        return
      }

      toast("success", "Invitación rechazada")
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
      setLoading(null)
      return
    }

    if (!currentUser) {
      toast("error", "Inicia sesión para aceptar la invitación")
      setLoading(null)
      return
    }

    // Mientras la invitación siga en "pending", RLS permite al invitado insertarse
    // como miembro; luego marcamos la invitación como aceptada.
    const { error: memberErr } = await supabase.from("project_members").insert({
      project_id: inv.project_id,
      user_id: currentUser.id,
      role: inv.role,
      invited_by: inv.inviter_id,
    })

    if (memberErr) {
      toast(
        "error",
        memberErr.message ||
          "No se pudo unir al proyecto. Si persiste, pide al administrador que te vuelva a invitar."
      )
      setLoading(null)
      return
    }

    const { error: updErr } = await supabase
      .from("project_invitations")
      .update({ status: "accepted" })
      .eq("id", invitationId)
      .eq("status", "pending")

    if (updErr) {
      await supabase.from("project_members").delete().eq("project_id", inv.project_id).eq("user_id", currentUser.id)
      toast("error", updErr.message || "No se pudo confirmar la invitación")
      setLoading(null)
      return
    }

    const { error: logErr } = await supabase.from("project_logs").insert({
      project_id: inv.project_id,
      user_id: currentUser.id,
      action: "member_joined",
      details: { role: inv.role },
    })
    if (logErr) {
      console.warn("[invitation accept] project_logs insert", logErr)
    }

    toast("success", "Te has unido al proyecto")

    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", currentUser.id)
      .eq("project_id", inv.project_id)
      .eq("type", "project_invitation")

    setDone(true)
    router.refresh()
    setLoading(null)
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
