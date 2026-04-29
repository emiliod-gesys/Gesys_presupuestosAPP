"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Modal } from "@/components/ui/modal"
import { Avatar } from "@/components/ui/avatar"
import { useToast } from "@/components/ui/toast"
import { UserPlus, Search, X } from "lucide-react"
import type { UserRole } from "@/lib/types"

type CompanionProfile = {
  id: string
  full_name: string | null
  email: string
  avatar_url: string | null
}

type InviteeEntry = {
  id: string
  full_name: string | null
  email: string
  avatar_url: string | null
  role: UserRole
}

function profileFromJoin(raw: unknown): CompanionProfile | null {
  if (!raw) return null
  const row = Array.isArray(raw) ? raw[0] : raw
  if (!row || typeof row !== "object" || !("id" in row) || !("email" in row)) return null
  const o = row as Record<string, unknown>
  return {
    id: String(o.id),
    full_name: (o.full_name as string | null) ?? null,
    email: String(o.email),
    avatar_url: (o.avatar_url as string | null) ?? null,
  }
}

function toInviteeEntry(p: CompanionProfile, role: UserRole = "worker"): InviteeEntry {
  return {
    id: p.id,
    full_name: p.full_name,
    email: p.email,
    avatar_url: p.avatar_url,
    role,
  }
}

const ROLE_OPTIONS = [
  { value: "admin", label: "Administrador - Puede editar todo" },
  { value: "worker", label: "Trabajador - Puede cargar información" },
  { value: "observer", label: "Observador - Solo puede visualizar" },
] as const

export function InviteMemberButton({ projectId }: { projectId: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [searching, setSearching] = useState(false)
  const [loading, setLoading] = useState(false)
  const [companionSuggestions, setCompanionSuggestions] = useState<CompanionProfile[]>([])
  const [searchHit, setSearchHit] = useState<CompanionProfile | null>(null)
  const [selected, setSelected] = useState<Map<string, InviteeEntry>>(() => new Map())

  const resetForm = useCallback(() => {
    setEmail("")
    setSearchHit(null)
  }, [])

  const handleClose = useCallback(() => {
    setOpen(false)
    setSelected(new Map())
    resetForm()
  }, [resetForm])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user || cancelled) return

      const [{ data: companions }, { data: members }] = await Promise.all([
        supabase
          .from("companions")
          .select(
            "user_id, companion_id, status, companion:profiles!companion_id(id, full_name, email, avatar_url), user:profiles!user_id(id, full_name, email, avatar_url)"
          )
          .or(`user_id.eq.${user.id},companion_id.eq.${user.id}`),
        supabase.from("project_members").select("user_id").eq("project_id", projectId),
      ])

      if (cancelled) return

      const memberIds = new Set((members || []).map((m) => m.user_id))
      const accepted = (companions || []).filter((c) => c.status === "accepted")
      const others: CompanionProfile[] = []
      for (const c of accepted) {
        const raw = c.user_id === user.id ? c.companion : c.user
        const other = profileFromJoin(raw)
        if (other && !memberIds.has(other.id)) {
          others.push(other)
        }
      }
      setCompanionSuggestions(others)
    })()
    return () => {
      cancelled = true
    }
  }, [open, projectId])

  const toggleCompanion = (p: CompanionProfile) => {
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(p.id)) {
        next.delete(p.id)
      } else {
        next.set(p.id, toInviteeEntry(p, "worker"))
      }
      return next
    })
  }

  const setEntryRole = (id: string, role: UserRole) => {
    setSelected((prev) => {
      const next = new Map(prev)
      const e = next.get(id)
      if (e) next.set(id, { ...e, role })
      return next
    })
  }

  const removeInvitee = (id: string) => {
    setSelected((prev) => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }

  const search = async () => {
    if (!email.trim()) return
    setSearching(true)
    setSearchHit(null)
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, email, avatar_url")
      .ilike("email", email.trim())
      .neq("id", user?.id ?? "")
      .single()
    if (data) {
      setSearchHit({
        id: data.id,
        full_name: data.full_name,
        email: data.email,
        avatar_url: data.avatar_url,
      })
    } else {
      toast("warning", "No se encontró ningún usuario con ese correo")
    }
    setSearching(false)
  }

  const addSearchHitToSelection = () => {
    if (!searchHit) return
    if (selected.has(searchHit.id)) {
      toast("warning", "Ese usuario ya está en la lista de invitación")
      return
    }
    setSelected((prev) => {
      const next = new Map(prev)
      next.set(searchHit.id, toInviteeEntry(searchHit, "worker"))
      return next
    })
    setSearchHit(null)
    setEmail("")
  }

  const sendInvitations = async () => {
    const invitees = [...selected.values()]
    if (invitees.length === 0) return

    setLoading(true)
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }

    const { data: projectRow } = await supabase.from("projects").select("name").eq("id", projectId).single()
    const projectName = projectRow?.name?.trim() || "Proyecto"

    const succeededIds: string[] = []
    const errors: string[] = []

    for (const entry of invitees) {
      const { data: existing } = await supabase
        .from("project_members")
        .select("id")
        .eq("project_id", projectId)
        .eq("user_id", entry.id)
        .maybeSingle()

      if (existing) {
        errors.push(`${entry.email}: ya es miembro`)
        continue
      }

      const { data: invitation, error } = await supabase
        .from("project_invitations")
        .insert({
          project_id: projectId,
          inviter_id: user.id,
          invitee_id: entry.id,
          role: entry.role,
        })
        .select("id")
        .single()

      if (error) {
        if (error.code === "23505") {
          errors.push(`${entry.email}: ya hay invitación pendiente`)
        } else {
          errors.push(`${entry.email}: error al invitar`)
        }
        continue
      }

      const roleLabel =
        entry.role === "admin" ? "Administrador" : entry.role === "worker" ? "Trabajador" : "Observador"

      await supabase.from("notifications").insert({
        user_id: entry.id,
        project_id: projectId,
        type: "project_invitation",
        title: "Nueva invitación a proyecto",
        message: `Te invitaron al proyecto «${projectName}» como ${roleLabel}.`,
        data: {
          invitation_id: invitation?.id,
          project_name: projectName,
          role: entry.role,
        },
      })

      await supabase.from("project_logs").insert({
        project_id: projectId,
        user_id: user.id,
        action: "member_invited",
        details: { invitee_email: entry.email, role: entry.role },
      })

      succeededIds.push(entry.id)
    }

    const sent = succeededIds.length

    if (sent > 0) {
      router.refresh()
    }

    if (sent === invitees.length && errors.length === 0) {
      toast("success", sent === 1 ? "Invitación enviada" : `${sent} invitaciones enviadas`)
      handleClose()
    } else if (sent > 0) {
      setSelected((prev) => {
        const next = new Map(prev)
        succeededIds.forEach((id) => next.delete(id))
        return next
      })
      toast(
        "warning",
        `${sent} enviada(s). Con incidencias: ${errors.slice(0, 3).join("; ")}${errors.length > 3 ? "…" : ""}`
      )
    } else {
      toast("error", errors.join("; ") || "No se pudo enviar ninguna invitación")
    }

    setLoading(false)
  }

  const selectedList = [...selected.values()]

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="h-3.5 w-3.5" /> Invitar miembro
      </Button>

      <Modal open={open} onClose={handleClose} title="Invitar miembros al proyecto" size="lg">
        <div className="p-6 space-y-4">
          {companionSuggestions.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-700">Tus compañeros</p>
              <p className="mt-0.5 text-xs text-gray-500">
                Pulsa para seleccionar o quitar. Cada persona tendrá su rol en la lista de abajo.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {companionSuggestions.map((p) => {
                  const isOn = selected.has(p.id)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggleCompanion(p)}
                      className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left text-xs transition-colors ${
                        isOn
                          ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200"
                          : "border-gray-200 bg-white hover:border-indigo-200 hover:bg-indigo-50/50"
                      }`}
                    >
                      <Avatar src={p.avatar_url} name={p.full_name || p.email} size="sm" />
                      <span className="max-w-[10rem] truncate font-medium text-gray-900">
                        {p.full_name || p.email}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

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

          {searchHit && (
            <div className="flex flex-col gap-2 rounded-xl border border-indigo-100 bg-indigo-50/80 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <Avatar src={searchHit.avatar_url} name={searchHit.full_name || searchHit.email} size="md" />
                <div>
                  <p className="text-sm font-semibold text-gray-900">{searchHit.full_name || "Sin nombre"}</p>
                  <p className="text-xs text-gray-500">{searchHit.email}</p>
                </div>
              </div>
              <Button type="button" size="sm" variant="primary" onClick={addSearchHitToSelection}>
                Añadir a la lista
              </Button>
            </div>
          )}

          {selectedList.length > 0 && (
            <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50/80 p-3">
              <p className="text-xs font-medium text-gray-800">
                Invitar ({selectedList.length}) — rol por persona
              </p>
              <ul className="space-y-3">
                {selectedList.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex flex-col gap-2 rounded-lg border border-gray-100 bg-white p-3 sm:flex-row sm:items-end sm:gap-3"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <Avatar src={entry.avatar_url} name={entry.full_name || entry.email} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900">
                          {entry.full_name || "Sin nombre"}
                        </p>
                        <p className="truncate text-xs text-gray-500">{entry.email}</p>
                      </div>
                    </div>
                    <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-end">
                      <div className="min-w-0 flex-1">
                        <Select
                          id={`invite-role-${entry.id}`}
                          label="Rol"
                          options={ROLE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                          value={entry.role}
                          onChange={(e) => setEntryRole(entry.id, e.target.value as UserRole)}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeInvitee(entry.id)}
                        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
                        aria-label={`Quitar a ${entry.full_name || entry.email}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={handleClose}>
              Cancelar
            </Button>
            <Button onClick={() => void sendInvitations()} loading={loading} disabled={selectedList.length === 0}>
              {selectedList.length <= 1 ? "Enviar invitación" : `Enviar ${selectedList.length} invitaciones`}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
