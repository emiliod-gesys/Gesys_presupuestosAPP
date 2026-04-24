"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { Copy } from "lucide-react"
export function DuplicateProjectButton({ projectId }: { projectId: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  const duplicate = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/duplicate`, {
        method: "POST",
        credentials: "include",
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast("error", (data as { error?: string }).error || "No se pudo duplicar")
        return
      }
      const newId = (data as { id?: string }).id
      if (newId) {
        toast("success", "Proyecto duplicado")
        router.push(`/projects/${newId}`)
        router.refresh()
      }
    } catch {
      toast("error", "Error de red al duplicar")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto" loading={loading} onClick={duplicate}>
      <Copy className="h-4 w-4" />
      Duplicar proyecto
    </Button>
  )
}
