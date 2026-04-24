"use client"

import { useCallback, useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { formatDateTime } from "@/lib/utils"
import { MessageCircle, ChevronDown, ChevronUp, Trash2 } from "lucide-react"

interface Row {
  id: string
  user_id: string
  body: string
  created_at: string
  author?: { full_name?: string | null; email: string } | null
}

export function TransactionCommentsPanel({
  transactionId,
  canAdd,
  currentUserId,
  isAdmin,
  initialCount,
}: {
  transactionId: string
  canAdd: boolean
  currentUserId: string
  isAdmin: boolean
  initialCount: number
}) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [body, setBody] = useState("")
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from("transaction_comments")
      .select("id, user_id, body, created_at, author:profiles!user_id(full_name, email)")
      .eq("transaction_id", transactionId)
      .order("created_at", { ascending: true })
    if (error) {
      if (error.message.includes("does not exist") || error.code === "42P01") {
        setRows([])
      } else toast("error", error.message)
    } else setRows((data as Row[]) || [])
    setLoading(false)
  }, [transactionId, toast])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  const add = async () => {
    if (!body.trim()) return
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from("transaction_comments").insert({
      transaction_id: transactionId,
      user_id: user.id,
      body: body.trim(),
    })
    if (error) toast("error", error.message)
    else {
      setBody("")
      await load()
    }
    setSaving(false)
  }

  const remove = async (id: string) => {
    const supabase = createClient()
    const { error } = await supabase.from("transaction_comments").delete().eq("id", id)
    if (error) toast("error", error.message)
    else await load()
  }

  const count = open ? rows.length : initialCount

  return (
    <div className="mt-2 border-t border-gray-100 pt-2 sm:mt-0 sm:border-t-0 sm:pt-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
      >
        <MessageCircle className="h-3.5 w-3.5" />
        {count} comentario{count === 1 ? "" : "s"}
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {open && (
        <div className="mt-2 rounded-lg bg-gray-50 p-3 text-sm">
          {loading ? (
            <p className="text-gray-500">Cargando…</p>
          ) : (
            <ul className="mb-3 space-y-2">
              {rows.length === 0 ? (
                <li className="text-gray-500">Sin comentarios aún.</li>
              ) : (
                rows.map((r) => (
                  <li key={r.id} className="rounded-md border border-gray-100 bg-white p-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs text-gray-500">
                          {(r.author?.full_name || r.author?.email || "Usuario") +
                            " · " +
                            formatDateTime(r.created_at)}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-gray-800">{r.body}</p>
                      </div>
                      {r.user_id === currentUserId || isAdmin ? (
                        <button
                          type="button"
                          aria-label="Eliminar comentario"
                          className="shrink-0 text-gray-400 hover:text-red-500"
                          onClick={() => remove(r.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))
              )}
            </ul>
          )}
          {canAdd && (
            <div className="space-y-2">
              <Textarea
                label="Nuevo comentario"
                placeholder="Escribe un comentario visible para el equipo…"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={2}
              />
              <Button type="button" size="sm" loading={saving} onClick={add}>
                Publicar
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
