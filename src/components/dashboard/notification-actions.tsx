"use client"

import Link from "next/link"
import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { formatDateTime } from "@/lib/utils"
import { Bell, Users, X } from "lucide-react"
import type { Notification } from "@/lib/types"
import { InvitationActions } from "@/components/dashboard/invitation-actions"
import { CompanionActions } from "@/components/companions/companion-actions"

function roleLabel(role: string | undefined) {
  if (role === "admin") return "Administrador"
  if (role === "worker") return "Trabajador"
  if (role === "observer") return "Observador"
  return "Miembro"
}

function ProjectInvitationNotification({ notification }: { notification: Notification }) {
  const [dismissed, setDismissed] = useState(false)
  const [invitationId, setInvitationId] = useState<string | null>(
    typeof notification.data?.invitation_id === "string" ? notification.data.invitation_id : null
  )
  const [projectName, setProjectName] = useState(
    typeof notification.data?.project_name === "string" ? notification.data.project_name : ""
  )
  const [resolved, setResolved] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user || !notification.project_id) {
        if (!cancelled) setResolved(true)
        return
      }

      if (!projectName) {
        const { data: p } = await supabase
          .from("projects")
          .select("name")
          .eq("id", notification.project_id)
          .maybeSingle()
        if (!cancelled && p?.name) setProjectName(p.name)
      }

      if (!invitationId) {
        const { data: inv } = await supabase
          .from("project_invitations")
          .select("id")
          .eq("project_id", notification.project_id)
          .eq("invitee_id", user.id)
          .eq("status", "pending")
          .maybeSingle()
        if (!cancelled && inv?.id) setInvitationId(inv.id)
      }

      if (!cancelled) setResolved(true)
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resolver una vez por notificación
  }, [notification.id, notification.project_id])

  const dismiss = async () => {
    setDismissed(true)
    const supabase = createClient()
    await supabase.from("notifications").update({ is_read: true }).eq("id", notification.id)
  }

  if (dismissed) return null

  if (!resolved) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-orange-100 bg-orange-50 p-2">
        <Bell className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-orange-500" />
        <p className="text-xs text-gray-500">Cargando invitación…</p>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-2 rounded-lg border border-orange-100 bg-orange-50 p-2">
      <Bell className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-orange-500" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-gray-800">{notification.title}</p>
        {projectName ? (
          <p className="mt-1 text-sm font-semibold text-gray-900">«{projectName}»</p>
        ) : (
          <p className="mt-1 text-xs text-gray-600">Proyecto (sin nombre)</p>
        )}
        <p className="mt-0.5 text-xs leading-relaxed text-gray-600">
          {typeof notification.data?.role === "string"
            ? `Rol: ${roleLabel(notification.data.role)}.`
            : notification.message}
        </p>
        <p className="mt-1 text-xs text-gray-400">{formatDateTime(notification.created_at)}</p>
        {invitationId && notification.project_id ? (
          <div className="mt-2">
            <InvitationActions invitationId={invitationId} />
          </div>
        ) : (
          <p className="mt-2 text-xs text-gray-500">Esta invitación ya no está pendiente o no está disponible.</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => void dismiss()}
        className="flex-shrink-0 text-gray-300 hover:text-gray-500"
        aria-label="Marcar como leída"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function CompanionRequestNotification({ notification }: { notification: Notification }) {
  const [dismissed, setDismissed] = useState(false)
  const [companionRowId, setCompanionRowId] = useState<string | null>(null)
  const [resolved, setResolved] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        if (!cancelled) {
          setCompanionRowId(null)
          setResolved(true)
        }
        return
      }

      const fromData = notification.data?.companion_row_id
      const idFromPayload = typeof fromData === "string" ? fromData : null

      if (idFromPayload) {
        const { data: row } = await supabase
          .from("companions")
          .select("id")
          .eq("id", idFromPayload)
          .eq("companion_id", user.id)
          .eq("status", "pending")
          .maybeSingle()
        if (!cancelled) {
          setCompanionRowId(row?.id ?? null)
          setResolved(true)
        }
        return
      }

      const { data: pendings } = await supabase
        .from("companions")
        .select("id, created_at")
        .eq("companion_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })

      let matchId: string | null = null
      if (pendings?.length === 1) {
        matchId = pendings[0].id
      } else if (pendings && pendings.length > 1) {
        const notifMs = new Date(notification.created_at).getTime()
        const close = pendings.find(
          (p) => Math.abs(new Date(p.created_at).getTime() - notifMs) < 120_000
        )
        matchId = close?.id ?? null
      }

      if (!cancelled) {
        setCompanionRowId(matchId)
        setResolved(true)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resolver una vez por notificación
  }, [notification.id, notification.created_at])

  const dismiss = async () => {
    setDismissed(true)
    const supabase = createClient()
    await supabase.from("notifications").update({ is_read: true }).eq("id", notification.id)
  }

  if (dismissed) return null

  if (!resolved) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-indigo-100 bg-indigo-50/80 p-2">
        <Users className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-indigo-600" />
        <p className="text-xs text-gray-500">Cargando solicitud…</p>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-2 rounded-lg border border-indigo-100 bg-indigo-50/80 p-2">
      <Users className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-indigo-600" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-gray-800">{notification.title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-gray-600">{notification.message}</p>
        <p className="mt-1 text-xs text-gray-400">{formatDateTime(notification.created_at)}</p>
        {companionRowId ? (
          <div className="mt-2">
            <CompanionActions
              companionId={companionRowId}
              action="respond"
              notificationId={notification.id}
            />
          </div>
        ) : (
          <p className="mt-2 text-xs text-gray-500">
            No se pudo enlazar la solicitud desde aquí. Revisa en{" "}
            <Link href="/companions" className="font-medium text-indigo-700 underline">
              Compañeros
            </Link>
            .
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => void dismiss()}
        className="flex-shrink-0 text-gray-300 hover:text-gray-500"
        aria-label="Marcar como leída"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export function NotificationActions({ notification }: { notification: Notification }) {
  const [dismissed, setDismissed] = useState(false)

  const dismiss = async () => {
    setDismissed(true)
    const supabase = createClient()
    await supabase.from("notifications").update({ is_read: true }).eq("id", notification.id)
  }

  if (dismissed) return null

  if (notification.type === "project_invitation") {
    return <ProjectInvitationNotification notification={notification} />
  }

  if (notification.type === "companion_request") {
    return <CompanionRequestNotification notification={notification} />
  }

  return (
    <div className="flex items-start gap-2 rounded-lg border border-orange-100 bg-orange-50 p-2">
      <Bell className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-orange-500" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-gray-800">{notification.title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{notification.message}</p>
        <p className="mt-1 text-xs text-gray-400">{formatDateTime(notification.created_at)}</p>
      </div>
      <button type="button" onClick={() => void dismiss()} className="flex-shrink-0 text-gray-300 hover:text-gray-500">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
