"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { formatDateTime } from "@/lib/utils"
import { Bell, X } from "lucide-react"
import type { Notification } from "@/lib/types"

export function NotificationActions({ notification }: { notification: Notification }) {
  const [dismissed, setDismissed] = useState(false)

  const dismiss = async () => {
    setDismissed(true)
    const supabase = createClient()
    await supabase.from("notifications").update({ is_read: true }).eq("id", notification.id)
  }

  if (dismissed) return null

  return (
    <div className="flex items-start gap-2 p-2 rounded-lg bg-orange-50 border border-orange-100">
      <Bell className="h-3.5 w-3.5 text-orange-500 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-800">{notification.title}</p>
        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{notification.message}</p>
        <p className="text-xs text-gray-400 mt-1">{formatDateTime(notification.created_at)}</p>
      </div>
      <button onClick={dismiss} className="text-gray-300 hover:text-gray-500 flex-shrink-0">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
