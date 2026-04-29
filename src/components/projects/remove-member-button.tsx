"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/components/ui/toast"
import { UserMinus } from "lucide-react"

interface Props {
  memberId: string
  projectId: string
  userName: string
}

export function RemoveMemberButton({ memberId, projectId, userName }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  const handleRemove = async () => {
    if (!confirm(`¿Remover a ${userName} del proyecto?`)) return
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data: member } = await supabase.from("project_members").select("user_id").eq("id", memberId).single()

    const { error: delErr } = await supabase.from("project_members").delete().eq("id", memberId)
    if (delErr) {
      toast("error", delErr.message || "No se pudo remover al miembro")
      setLoading(false)
      return
    }

    if (user && member) {
      await supabase.from("project_logs").insert({
        project_id: projectId,
        user_id: user.id,
        action: "member_removed",
        details: { removed_user_id: member.user_id },
      })
    }

    toast("success", `${userName} ha sido removido del proyecto`)
    setLoading(false)
    router.refresh()
  }

  return (
    <button
      onClick={handleRemove}
      disabled={loading}
      className="text-gray-300 hover:text-red-400 transition-colors disabled:opacity-50 p-1"
      title="Remover miembro"
    >
      <UserMinus className="h-4 w-4" />
    </button>
  )
}
