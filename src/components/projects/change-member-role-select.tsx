"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/components/ui/toast"
import type { UserRole } from "@/lib/types"
import { cn } from "@/lib/utils"

const OPTIONS: { value: UserRole; label: string }[] = [
  { value: "admin", label: "Administrador" },
  { value: "worker", label: "Trabajador" },
  { value: "observer", label: "Observador" },
]

interface Props {
  memberId: string
  value: UserRole
}

export function ChangeMemberRoleSelect({ memberId, value }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [current, setCurrent] = useState(value)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setCurrent(value)
  }, [value])

  const onChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value as UserRole
    if (next === current) return
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.from("project_members").update({ role: next }).eq("id", memberId)
    if (error) {
      toast("error", error.message || "No se pudo actualizar el rol")
      e.target.value = current
    } else {
      setCurrent(next)
      toast("success", "Rol actualizado")
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <select
      id={`member-role-${memberId}`}
      aria-label="Cambiar rol del miembro"
      value={current}
      disabled={loading}
      onChange={(e) => void onChange(e)}
      className={cn(
        "min-w-[9.5rem] rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs font-medium text-gray-900",
        "focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500",
        "disabled:opacity-60"
      )}
    >
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
