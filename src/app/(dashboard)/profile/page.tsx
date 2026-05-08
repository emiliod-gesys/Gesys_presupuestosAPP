"use client"

import { useState, useEffect, useCallback } from "react"
import Image from "next/image"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Avatar } from "@/components/ui/avatar"
import { useToast } from "@/components/ui/toast"
import { Save, KeyRound, RefreshCw } from "lucide-react"
import type { Profile, UserOdooSettings } from "@/lib/types"
import { isOdooPublicCloudUrl } from "@/lib/odoo/client"

export default function ProfilePage() {
  const { toast } = useToast()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [fullName, setFullName] = useState("")
  const [loading, setLoading] = useState(false)
  const [pwLoading, setPwLoading] = useState(false)
  const [newPw, setNewPw] = useState("")
  const [confirmPw, setConfirmPw] = useState("")
  const [odooUrl, setOdooUrl] = useState("")
  const [odooDatabase, setOdooDatabase] = useState("")
  const [odooLogin, setOdooLogin] = useState("")
  const [odooPassword, setOdooPassword] = useState("")
  const [hasStoredOdooPassword, setHasStoredOdooPassword] = useState(false)
  const [odooLoading, setOdooLoading] = useState(false)
  const [odooCompanyId, setOdooCompanyId] = useState("")
  const [odooCompanies, setOdooCompanies] = useState<{ id: number; name: string }[]>([])
  const [odooCompaniesLoading, setOdooCompaniesLoading] = useState(false)

  const fetchProfileOdooCompanies = useCallback(async (opts?: { announce?: boolean }) => {
    setOdooCompaniesLoading(true)
    try {
      const res = await fetch("/api/odoo/companies", { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        toast("error", data.message || "No se pudieron cargar las empresas de Odoo")
        setOdooCompanies([])
        return
      }
      const list = (data.companies || []) as { id: number; name: string }[]
      setOdooCompanies(list)
      if (opts?.announce) toast("success", `${list.length} empresa(s) desde Odoo`)
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      const { data: row } = await supabase
        .from("user_odoo_settings")
        .select("odoo_company_id")
        .eq("user_id", user.id)
        .maybeSingle()
      if (list.length === 1 && row?.odoo_company_id == null) {
        const only = list[0].id
        const { error } = await supabase
          .from("user_odoo_settings")
          .update({ odoo_company_id: only, updated_at: new Date().toISOString() })
          .eq("user_id", user.id)
        if (!error) setOdooCompanyId(String(only))
      }
    } finally {
      setOdooCompaniesLoading(false)
    }
  }, [toast])

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
        .select("odoo_url, odoo_database, odoo_login, odoo_password, odoo_company_id")
        .eq("user_id", user.id)
        .maybeSingle()
      if (odoo) {
        const o = odoo as UserOdooSettings
        setOdooUrl(o.odoo_url || "")
        setOdooDatabase(o.odoo_database || "")
        setOdooLogin(o.odoo_login || "")
        setHasStoredOdooPassword(!!o.odoo_password)
        setOdooCompanyId(o.odoo_company_id != null ? String(o.odoo_company_id) : "")
        if (o.odoo_url?.trim() && o.odoo_login?.trim() && o.odoo_password) {
          await fetchProfileOdooCompanies()
        }
      }
    }
    load()
  }, [fetchProfileOdooCompanies])

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

    const urlTrim = odooUrl.trim().replace(/\/+$/, "") || null
    const dbTrim = odooDatabase.trim() || null

    const { data: existing } = await supabase
      .from("user_odoo_settings")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle()

    const updatedAt = new Date().toISOString()

    if (existing) {
      const patch: {
        odoo_url: string | null
        odoo_database: string | null
        odoo_login: string | null
        updated_at: string
        odoo_password?: string
      } = {
        odoo_url: urlTrim,
        odoo_database: dbTrim,
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
        setOdooUrl(urlTrim ?? "")
        await fetchProfileOdooCompanies()
      }
    } else {
      if (!urlTrim) {
        toast("error", "Indica la URL de la base de datos Odoo")
        setOdooLoading(false)
        return
      }
      if (!passTrim) {
        toast("error", "Indica la contraseña de Odoo la primera vez que guardas")
        setOdooLoading(false)
        return
      }
      const { error } = await supabase.from("user_odoo_settings").insert({
        user_id: user.id,
        odoo_url: urlTrim,
        odoo_database: dbTrim,
        odoo_login: loginTrim || null,
        odoo_password: passTrim,
        odoo_company_id: null,
        updated_at: updatedAt,
      })
      if (error) {
        toast("error", "No se pudo guardar la vinculación con Odoo. ¿Ejecutaste la migración SQL en Supabase?")
      } else {
        toast("success", "Vinculación con Odoo guardada")
        setHasStoredOdooPassword(true)
        setOdooPassword("")
        setOdooUrl(urlTrim ?? "")
        await fetchProfileOdooCompanies()
      }
    }
    setOdooLoading(false)
  }

  const persistProfileOdooCompany = async (next: string) => {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return
    const n = next.trim() === "" ? NaN : Number(next)
    const id = Number.isFinite(n) && n > 0 ? n : null
    const { error } = await supabase
      .from("user_odoo_settings")
      .update({ odoo_company_id: id, updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
    if (error) {
      toast("error", "No se pudo guardar la empresa en el perfil")
      return
    }
    setOdooCompanyId(id != null ? String(id) : "")
    toast("success", "Empresa Odoo predeterminada guardada")
  }

  const odooCompanyOptions = [
    { value: "", label: "Sin empresa predeterminada" },
    ...odooCompanies.map((c) => ({ value: String(c.id), label: c.name })),
  ]

  const showOdooCompanyPicker = hasStoredOdooPassword && odooUrl.trim() !== "" && odooLogin.trim() !== ""

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
      <Card className="border-l-4 border-l-[#875A7B]">
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
            Indica la URL de tu base Odoo (por ejemplo la dirección con la que abres Odoo en el navegador), el mismo usuario o
            correo con el que inicias sesión y la contraseña. Solo tú puedes ver estos datos; guárdalos en un entorno de confianza y
            revisa las políticas de tu organización antes de almacenar credenciales en la nube.
          </p>
          <Input
            label="URL de la base de datos"
            type="url"
            autoComplete="url"
            value={odooUrl}
            onChange={(e) => setOdooUrl(e.target.value)}
            placeholder="https://tu-empresa.odoo.com"
            helperText="Sin barra final; suele ser el mismo enlace que usas para entrar a Odoo."
          />
          <Input
            label="Base de datos Odoo (opcional)"
            value={odooDatabase}
            onChange={(e) => setOdooDatabase(e.target.value)}
            placeholder="Dejar vacío en nombre.odoo.com salvo que te indiquen otro nombre"
            helperText={
              "En URLs nombre.odoo.com suele bastar dejarlo vacío (usamos el subdominio). " +
              "Rellenarlo mal puede provocar errores al cargar empresas. En servidor propio debe coincidir con la base PostgreSQL de Odoo."
            }
          />
          <Input
            label="Usuario o correo en Odoo"
            type="text"
            autoComplete="username"
            value={odooLogin}
            onChange={(e) => setOdooLogin(e.target.value)}
            placeholder="El mismo que en la pantalla de inicio de sesión de Odoo"
            helperText="En odoo.com suele ser tu correo. En instalaciones antiguas puede ser un nombre de usuario (p. ej. admin)."
          />
          {isOdooPublicCloudUrl(odooUrl) && (
            <p className="text-xs text-amber-800 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 leading-relaxed">
              <strong>Odoo Online:</strong> para API/JSON-RPC el usuario suele necesitar una{" "}
              <strong>contraseña local</strong> (Ajustes → Usuarios → tu usuario → Acción → Cambiar contraseña), distinta del
              inicio SSO del portal. La <strong>API externa no está disponible en todos los planes</strong>; si el login web
              funciona y la API no, revisa el plan y la{" "}
              <a
                href="https://www.odoo.com/documentation/18.0/developer/reference/external_api.html"
                className="text-indigo-700 underline hover:text-indigo-900"
                target="_blank"
                rel="noreferrer"
              >
                documentación External API de Odoo
              </a>
              .
            </p>
          )}
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
          <Button onClick={saveOdooLink} loading={odooLoading} variant="outline" className="w-full border-[#875A7B]/40 text-[#5b4a5c] hover:bg-[#875A7B]/5">
            Guardar vinculación Odoo
          </Button>
          {showOdooCompanyPicker && (
            <div className="space-y-3 rounded-lg border border-gray-100 bg-gray-50/80 p-4">
              <p className="text-xs font-medium text-gray-700">Empresa Odoo (multiempresa)</p>
              <p className="text-xs text-gray-500">
                Tras guardar credenciales se cargan las empresas de tu base. La predeterminada se usa en la pestaña Odoo
                de tus proyectos; puedes actualizar el listado si creas empresas nuevas en Odoo.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1">
                  <Select
                    label="Empresa predeterminada"
                    options={odooCompanyOptions}
                    value={odooCompanyId}
                    onChange={(e) => void persistProfileOdooCompany(e.target.value)}
                    className="text-sm bg-white"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  loading={odooCompaniesLoading}
                  onClick={() => void fetchProfileOdooCompanies({ announce: true })}
                  className="shrink-0"
                >
                  <RefreshCw className="h-4 w-4" /> Actualizar empresas
                </Button>
              </div>
            </div>
          )}
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
