import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Avatar } from "@/components/ui/avatar"
import { StatusBadge } from "@/components/ui/badge"
import { AddCompanionButton } from "@/components/companions/add-companion-button"
import { CompanionActions } from "@/components/companions/companion-actions"
import { Users } from "lucide-react"

export default async function CompanionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: companions } = await supabase
    .from("companions")
    .select("*, companion:profiles!companion_id(id, full_name, email, avatar_url), user:profiles!user_id(id, full_name, email, avatar_url)")
    .or(`user_id.eq.${user.id},companion_id.eq.${user.id}`)
    .order("created_at", { ascending: false })

  const accepted = (companions || []).filter((c) => c.status === "accepted")
  const pendingSent = (companions || []).filter((c) => c.status === "pending" && c.user_id === user.id)
  const pendingReceived = (companions || []).filter((c) => c.status === "pending" && c.companion_id === user.id)

  const getOther = (c: { user_id: string; user: unknown; companion: unknown }) => {
    if (c.user_id === user.id) return c.companion as { id: string; full_name?: string; email: string; avatar_url?: string }
    return c.user as { id: string; full_name?: string; email: string; avatar_url?: string }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Compañeros</h1>
          <p className="text-gray-500 text-sm mt-0.5">Conecta con otros usuarios para colaborar en proyectos</p>
        </div>
        <AddCompanionButton />
      </div>

      {/* Pending received */}
      {pendingReceived.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-gray-900">
              Solicitudes recibidas ({pendingReceived.length})
            </h2>
          </CardHeader>
          <CardContent className="p-0">
            {pendingReceived.map((c) => {
              const other = getOther(c)
              return (
                <div key={c.id} className="flex items-center gap-4 px-6 py-4 border-b last:border-0 border-gray-50">
                  <Avatar src={other?.avatar_url} name={other?.full_name || other?.email} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{other?.full_name || "Sin nombre"}</p>
                    <p className="text-xs text-gray-500">{other?.email}</p>
                  </div>
                  <CompanionActions companionId={c.id} action="respond" />
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* Accepted companions */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-indigo-600" />
            <h2 className="text-sm font-semibold text-gray-900">
              Mis compañeros ({accepted.length})
            </h2>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!accepted.length ? (
            <div className="py-12 text-center text-gray-400">
              <Users className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p className="font-medium">Sin compañeros aún</p>
              <p className="text-sm mt-1">Busca usuarios por correo para agregar compañeros</p>
            </div>
          ) : (
            accepted.map((c) => {
              const other = getOther(c)
              return (
                <div key={c.id} className="flex items-center gap-4 px-6 py-4 border-b last:border-0 border-gray-50 hover:bg-gray-50 transition-colors">
                  <Avatar src={other?.avatar_url} name={other?.full_name || other?.email} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{other?.full_name || "Sin nombre"}</p>
                    <p className="text-xs text-gray-500">{other?.email}</p>
                  </div>
                  <StatusBadge status="accepted" />
                  <CompanionActions companionId={c.id} action="remove" />
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      {/* Pending sent */}
      {pendingSent.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-gray-900">
              Solicitudes enviadas ({pendingSent.length})
            </h2>
          </CardHeader>
          <CardContent className="p-0">
            {pendingSent.map((c) => {
              const other = getOther(c)
              return (
                <div key={c.id} className="flex items-center gap-4 px-6 py-4 border-b last:border-0 border-gray-50">
                  <Avatar src={other?.avatar_url} name={other?.full_name || other?.email} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{other?.full_name || "Sin nombre"}</p>
                    <p className="text-xs text-gray-500">{other?.email}</p>
                  </div>
                  <StatusBadge status="pending" />
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
