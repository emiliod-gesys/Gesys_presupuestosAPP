"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Modal } from "@/components/ui/modal"
import { Avatar } from "@/components/ui/avatar"
import { useToast } from "@/components/ui/toast"
import { UserPlus, Search } from "lucide-react"

export function InviteMemberButton({ projectId }: { projectId: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<"admin" | "worker" | "observer">("worker")
  const [found, setFound] = useState<{ id: string; full_name?: string; email: string; avatar_url?: string } | null>(null)
  const [searching, setSearching] = useState(false)
  const [loading, setLoading] = useState(false)

  const search = async () => {
    if (!email.trim()) return
    setSearching(true)
    setFound(null)
    const supabase = createClient()
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, email, avatar_url")
      .ilike("email", email.trim())
      .single()
    setFound(data || null)
    if (!data) toast("warning", "No se encontró ningún usuario con ese correo")
    setSearching(false)
  }

  const invite = async () => {
    if (!found) return
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Check if already member
    const { data: existing } = await supabase
      .from("project_members")
      .select("id")
      .eq("project_id", projectId)
      .eq("user_id", found.id)
      .single()

    if (existing) {
      toast("error", "Este usuario ya es miembro del proyecto")
      setLoading(false)
      return
    }

    const { data: projectRow } = await supabase
      .from("projects")
      .select("name")
      .eq("id", projectId)
      .single()

    const projectName = projectRow?.name?.trim() || "Proyecto"

    const { data: invitation, error } = await supabase
      .from("project_invitations")
      .insert({
        project_id: projectId,
        inviter_id: user.id,
        invitee_id: found.id,
        role,
      })
      .select("id")
      .single()

    if (error) {
      if (error.code === "23505") {
        toast("error", "Ya existe una invitación pendiente para este usuario")
      } else {
        toast("error", "Error al enviar la invitación")
      }
    } else {
      const roleLabel =
        role === "admin" ? "Administrador" : role === "worker" ? "Trabajador" : "Observador"
      // Create notification for invitee (data para UI: nombre + id de invitación)
      await supabase.from("notifications").insert({
        user_id: found.id,
        project_id: projectId,
        type: "project_invitation",
        title: "Nueva invitación a proyecto",
        message: `Te invitaron al proyecto «${projectName}» como ${roleLabel}.`,
        data: {
          invitation_id: invitation?.id,
          project_name: projectName,
          role,
        },
      })

      await supabase.from("project_logs").insert({
        project_id: projectId,
        user_id: user.id,
        action: "member_invited",
        details: { invitee_email: found.email, role },
      })

      toast("success", "Invitación enviada")
      setOpen(false)
      setEmail("")
      setFound(null)
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="h-3.5 w-3.5" /> Invitar miembro
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Invitar miembro al proyecto">
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
              <Button variant="outline" onClick={search} loading={searching} size="md">
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {found && (
            <div className="flex items-center gap-3 p-3 bg-indigo-50 border border-indigo-100 rounded-xl">
              <Avatar src={found.avatar_url} name={found.full_name || found.email} size="md" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900">{found.full_name || "Sin nombre"}</p>
                <p className="text-xs text-gray-500">{found.email}</p>
              </div>
            </div>
          )}

          <Select
            label="Rol a asignar"
            options={[
              { value: "admin", label: "Administrador - Puede editar todo" },
              { value: "worker", label: "Trabajador - Puede cargar información" },
              { value: "observer", label: "Observador - Solo puede visualizar" },
            ]}
            value={role}
            onChange={(e) => setRole(e.target.value as "admin" | "worker" | "observer")}
          />

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={invite} loading={loading} disabled={!found}>
              Enviar invitación
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
