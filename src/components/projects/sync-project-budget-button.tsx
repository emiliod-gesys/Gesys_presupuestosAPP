"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"

export function SyncProjectBudgetButton({
  projectId,
  sumFromCategories,
}: {
  projectId: string
  sumFromCategories: number
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  const handle = async () => {
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase
      .from("projects")
      .update({ total_budget: sumFromCategories, updated_at: new Date().toISOString() })
      .eq("id", projectId)
    if (error) toast("error", error.message)
    else {
      toast("success", "Presupuesto total actualizado a la suma de renglones")
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <Button type="button" size="sm" variant="outline" loading={loading} onClick={handle}>
      Igualar total del proyecto a la suma de renglones
    </Button>
  )
}
