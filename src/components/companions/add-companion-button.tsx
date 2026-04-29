"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Modal } from "@/components/ui/modal"
import { Avatar } from "@/components/ui/avatar"
import { useToast } from "@/components/ui/toast"
import { UserPlus, Search } from "lucide-react"

export function AddCompanionButton() {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [searching, setSearching] = useState(false)
  const [loading, setLoading] = useState(false)
  const [found, setFound] = useState<{ id: string; full_name?: string; email: string; avatar_url?: string } | null>(null)

  const search = async () => {
    if (!email.trim()) return
    setSearching(true)
    setFound(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, email, avatar_url")
      .ilike("email", email.trim())
      .neq("id", user?.id || "")
      .single()
    setFound(data || null)
    if (!data) toast("warning", "No se encontró ningún usuario con ese correo")
    setSearching(false)
  }

  const send = async () => {
    if (!found) return
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: companionRow, error } = await supabase
      .from("companions")
      .insert({
        user_id: user.id,
        companion_id: found.id,
      })
      .select("id")
      .single()

    if (error) {
      if (error.code === "23505") {
        toast("error", "Ya existe una relación con este usuario")
      } else {
        toast("error", "Error al enviar la solicitud")
      }
    } else {
      await supabase.from("notifications").insert({
        user_id: found.id,
        type: "companion_request",
        title: "Nueva solicitud de compañero",
        message: "Alguien quiere agregarte como compañero.",
        data: companionRow?.id ? { companion_row_id: companionRow.id } : null,
      })
      toast("success", "Solicitud enviada")
      setOpen(false)
      setEmail("")
      setFound(null)
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <>
      <Button className="w-full sm:w-auto" onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4" /> Agregar compañero
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Agregar compañero">
        <div className="p-6 space-y-4">
          <div className="flex gap-2">
            <Input
              label="Buscar por correo electrónico"
              type="email"
              placeholder="correo@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              className="flex-1"
            />
            <div className="flex items-end">
              <Button variant="outline" onClick={search} loading={searching}>
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {found && (
            <div className="flex items-center gap-3 p-3 bg-indigo-50 border border-indigo-100 rounded-xl">
              <Avatar src={found.avatar_url} name={found.full_name || found.email} />
              <div>
                <p className="text-sm font-semibold text-gray-900">{found.full_name || "Sin nombre"}</p>
                <p className="text-xs text-gray-500">{found.email}</p>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={send} loading={loading} disabled={!found}>
              Enviar solicitud
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
