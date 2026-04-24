"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Avatar } from "@/components/ui/avatar"
import { useToast } from "@/components/ui/toast"
import { Save, KeyRound } from "lucide-react"
import type { Profile } from "@/lib/types"

export default function ProfilePage() {
  const { toast } = useToast()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [fullName, setFullName] = useState("")
  const [loading, setLoading] = useState(false)
  const [pwLoading, setPwLoading] = useState(false)
  const [newPw, setNewPw] = useState("")
  const [confirmPw, setConfirmPw] = useState("")
  const [odooLogin, setOdooLogin] = useState("")
  const [odooPassword, setOdooPassword] = useState("")
  const [hasStoredOdooPassword, setHasStoredOdooPassword] = useState(false)
  const [odooLoading, setOdooLoading] = useState(false)

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single()
      if (data) {
        setProfile(data)
        setFullName(data.full_name || "")
      }
      const { data: odoo } = await supabase
        .from("user_odoo_settings")
        .select("odoo_login, odoo_password")
        .eq("user_id", user.id)
        .maybeSingle()
      if (odoo) {
        setOdooLogin(odoo.odoo_login || "")
        setHasStoredOdooPassword(!!odoo.odoo_password)
      }
    }
    load()
  }, [])

  const saveProfile = async () => {
    if (!profile) return
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName, updated_at: new Date().toISOString() })
      .eq("id", profile.id)
    if (error) {
      toast("error", "Error al actualizar el perfil")
    } else {
      toast("success", "Perfil actualizado")
      setProfile((p) => p ? { ...p, full_name: fullName } : p)
    }
    setLoading(false)
  }

  const changePassword = async () => {
    if (newPw !== confirmPw) {
      toast("error", "Las contraseñas no coinciden")
      return
    }
    if (newPw.length < 8) {
      toast("error", "La contraseña debe tener al menos 8 caracteres")
      return
    }
    setPwLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: newPw })
    if (error) {
      toast("error", "Error al cambiar la contraseña")
    } else {
      toast("success", "Contraseña actualizada")
      setNewPw("")
      setConfirmPw("")
    }
    setPwLoading(false)
  }

  const saveOdooLink = async () => {
    if (!profile) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setOdooLoading(true)
    const loginTrim = odooLogin.trim()
    const passTrim = odooPassword.trim()

    const { data: existing } = await supabase
      .from("user_odoo_settings")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle()

    const updatedAt = new Date().toISOString()

    if (existing) {
      const patch: { odoo_login: string | null; updated_at: string; odoo_password?: string } = {
        odoo_login: loginTrim || null,
        updated_at: updatedAt,
      }
      if (passTrim) patch.odoo_password = passTrim
      const { error } = await supabase.from("user_odoo_settings").update(patch).eq("user_id", user.id)
      if (error) {
        toast("error", "No se pudo guardar la vinculación con Odoo. ¿Ejecutaste la migración SQL en Supabase?")
      } else {
        toast("success", "Vinculación con Odoo guardada")
        if (passTrim) setHasStoredOdooPassword(true)
        setOdooPassword("")
      }
    } else {
      if (!passTrim) {
        toast("error", "Indica la contraseña de Odoo la primera vez que guardas")
        setOdooLoading(false)
        return
      }
      const { error } = await supabase.from("user_odoo_settings").insert({
        user_id: user.id,
        odoo_login: loginTrim || null,
        odoo_password: passTrim,
        updated_at: updatedAt,
      })
      if (error) {
        toast("error", "No se pudo guardar la vinculación con Odoo. ¿Ejecutaste la migración SQL en Supabase?")
      } else {
        toast("success", "Vinculación con Odoo guardada")
        setHasStoredOdooPassword(true)
        setOdooPassword("")
      }
    }
    setOdooLoading(false)
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto space-y-6 animate-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mi perfil</h1>
        <p className="text-gray-500 text-sm mt-0.5">Administra tu información personal</p>
      </div>

      {/* Profile info */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-gray-900">Información personal</h2>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-4">
            <Avatar src={profile.avatar_url} name={profile.full_name || profile.email} size="lg" />
            <div>
              <p className="font-medium text-gray-900">{profile.full_name || "Sin nombre"}</p>
              <p className="text-sm text-gray-500">{profile.email}</p>
            </div>
          </div>
          <Input
            label="Nombre completo"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Tu nombre completo"
          />
          <Input
            label="Correo electrónico"
            value={profile.email}
            disabled
            helperText="El correo no se puede cambiar"
          />
          <Button onClick={saveProfile} loading={loading} className="w-full">
            <Save className="h-4 w-4" /> Guardar cambios
          </Button>
        </CardContent>
      </Card>

      {/* Odoo */}
      <Card className="border-l-4 border-l-[#714B67]">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Image
              src="/branding/odoo-logo.svg"
              alt="Odoo"
              width={88}
              height={28}
              className="h-7 w-auto"
            />
            <h2 className="text-sm font-semibold text-gray-900">Vinculación con Odoo</h2>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-gray-500 leading-relaxed">
            Usa el mismo correo y contraseña con los que inicias sesión en Odoo. Solo tú puedes ver estos datos;
            guárdalos en un entorno de confianza y revisa las políticas de tu organización antes de almacenar
            credenciales en la nube.
          </p>
          <Input
            label="Correo en Odoo"
            type="email"
            autoComplete="username"
            value={odooLogin}
            onChange={(e) => setOdooLogin(e.target.value)}
            placeholder="usuario@empresa.com"
          />
          <Input
            label="Contraseña de Odoo"
            type="password"
            autoComplete="current-password"
            value={odooPassword}
            onChange={(e) => setOdooPassword(e.target.value)}
            placeholder={hasStoredOdooPassword ? "Dejar en blanco para no cambiarla" : "Contraseña"}
            helperText={
              hasStoredOdooPassword
                ? "Ya hay una contraseña guardada. Escribe una nueva solo si quieres reemplazarla."
                : undefined
            }
          />
          <Button onClick={saveOdooLink} loading={odooLoading} variant="outline" className="w-full border-[#714B67]/40 text-[#5c3d56] hover:bg-[#714B67]/5">
            Guardar vinculación Odoo
          </Button>
        </CardContent>
      </Card>

      {/* Change password */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-indigo-600" />
            <h2 className="text-sm font-semibold text-gray-900">Cambiar contraseña</h2>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            label="Nueva contraseña"
            type="password"
            placeholder="Mínimo 8 caracteres"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
          />
          <Input
            label="Confirmar contraseña"
            type="password"
            placeholder="Repite la contraseña"
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
          />
          <Button onClick={changePassword} loading={pwLoading} variant="outline" className="w-full">
            Cambiar contraseña
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
