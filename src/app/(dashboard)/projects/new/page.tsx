"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardFooter } from "@/components/ui/card"
import { useToast } from "@/components/ui/toast"
import { ArrowLeft, FolderPlus, Plus, Trash2, Upload } from "lucide-react"
import Link from "next/link"
import { formatSupabaseError } from "@/lib/utils"
import {
  emptyGroupDraft,
  emptyLineDraft,
  templateCategoriesToGroupDrafts,
  type NewProjectGroupDraft,
  type NewProjectLineDraft,
} from "@/lib/budget-category-tree"

interface Template {
  id: string
  name: string
}

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let cur = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (c === "," && !inQuotes) {
      result.push(cur.trim())
      cur = ""
      continue
    }
    cur += c
  }
  result.push(cur.trim())
  return result.map((s) => s.replace(/^"|"$/g, "").trim())
}

/** Columnas: nombre, monto [, descripci?n]. Primera fila puede ser cabecera (nombre/name, monto/budget_amount). */
function parseBudgetCategoryCsv(text: string): { name: string; budget_amount: string; description: string }[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0)
  if (!lines.length) return []
  let start = 0
  const header = lines[0].toLowerCase()
  if (
    header.includes("nombre") ||
    header.includes("name") ||
    header.includes("monto") ||
    header.includes("budget") ||
    header.includes("descrip")
  ) {
    start = 1
  }
  const out: { name: string; budget_amount: string; description: string }[] = []
  for (let i = start; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i])
    const name = (cells[0] || "").trim()
    if (!name) continue
    const rawAmount = cells[1] !== undefined ? String(cells[1]).trim().replace(/,/g, "") : ""
    const amount = rawAmount === "" ? "0" : rawAmount
    const description = cells.slice(2).join(",").trim()
    out.push({ name, budget_amount: amount, description })
  }
  return out
}

export default function NewProjectPage() {
  const router = useRouter()
  const { toast } = useToast()
  const csvInputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [templates, setTemplates] = useState<Template[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState("")

  const [form, setForm] = useState({
    name: "",
    description: "",
    location: "",
    client: "",
    start_date: "",
    end_date: "",
    total_budget: "",
    currency: "GTQ",
  })

  const [groups, setGroups] = useState<NewProjectGroupDraft[]>(() => [emptyGroupDraft()])

  useEffect(() => {
    const loadTemplates = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from("projects")
        .select("id, name")
        .eq("is_template", true)
        .eq("created_by", user.id)
      setTemplates(data || [])
    }
    loadTemplates()
  }, [])

  const loadTemplate = async (templateId: string) => {
    if (!templateId) return
    const supabase = createClient()
    const { data: cats } = await supabase
      .from("budget_categories")
      .select("id, name, description, budget_amount, parent_id, order_index")
      .eq("project_id", templateId)
      .order("order_index")
    if (cats?.length) {
      setGroups(templateCategoriesToGroupDrafts(cats))
    }
  }

  const addGroup = () => {
    setGroups((prev) => [...prev, emptyGroupDraft()])
  }

  const removeGroup = (groupId: string) => {
    setGroups((prev) => (prev.length <= 1 ? prev : prev.filter((g) => g.id !== groupId)))
  }

  const updateGroup = (groupId: string, field: "name" | "description", value: string) => {
    setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, [field]: value } : g)))
  }

  const addLineToGroup = (groupId: string) => {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, lines: [...g.lines, emptyLineDraft()] } : g))
    )
  }

  const removeLine = (groupId: string, lineId: string) => {
    setGroups((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g
        if (g.lines.length <= 1) {
          return { ...g, lines: [{ ...g.lines[0], name: "", description: "", budget_amount: "" }] }
        }
        return { ...g, lines: g.lines.filter((l) => l.id !== lineId) }
      })
    )
  }

  const updateLine = (groupId: string, lineId: string, field: keyof NewProjectLineDraft, value: string) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.id !== groupId
          ? g
          : {
              ...g,
              lines: g.lines.map((l) => (l.id === lineId ? { ...l, [field]: value } : l)),
            }
      )
    )
  }

  const onCsvSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result || "")
      const parsed = parseBudgetCategoryCsv(text)
      if (!parsed.length) {
        toast(
          "error",
          "No se encontraron filas v?lidas. Use CSV con columnas: nombre, monto, descripci?n (opcional)."
        )
        return
      }
      setGroups([
        {
          ...emptyGroupDraft(),
          name: "",
          lines: parsed.map((r, i) => ({
            id: `csv-${Date.now()}-${i}`,
            name: r.name,
            description: r.description,
            budget_amount: r.budget_amount,
          })),
        },
      ])
      toast("success", `Importados ${parsed.length} renglones en una categor?a (puedes nombrarla arriba)`)
    }
    reader.onerror = () => toast("error", "No se pudo leer el archivo")
    reader.readAsText(file, "UTF-8")
  }

  const handleSubmit = async (e: React.FormEvent, saveAsTemplate = false) => {
    e.preventDefault()
    if (!form.name.trim()) {
      toast("error", "El nombre del proyecto es requerido")
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push("/login"); return }
    if (!user.email) {
      toast("error", "Tu cuenta no tiene correo electr\u00f3nico; no se puede crear el proyecto.")
      setLoading(false)
      return
    }

    // projects.created_by referencia profiles(id); sin fila en profiles el INSERT falla (FK).
    const { data: existingProfile } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle()
    if (!existingProfile) {
      const meta = user.user_metadata || {}
      const { error: profileErr } = await supabase.from("profiles").insert({
        id: user.id,
        email: user.email,
        full_name: (meta.full_name as string | undefined) ?? (meta.name as string | undefined) ?? null,
        avatar_url: (meta.avatar_url as string | undefined) ?? null,
      })
      if (profileErr) {
        toast("error", profileErr.message || "No se pudo crear tu perfil. Ejecuta el SQL de pol\u00edticas en Supabase (profiles_insert_own) o revisa la tabla profiles en Table Editor.")
        setLoading(false)
        return
      }
    }

    const totalBudget = groups.reduce(
      (sum, g) => sum + g.lines.reduce((s, l) => s + (parseFloat(l.budget_amount) || 0), 0),
      0
    )

    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    const templateId =
      selectedTemplate && uuidRe.test(selectedTemplate.trim()) ? selectedTemplate.trim() : null

    const { data: project, error } = await supabase.from("projects").insert({
      name: form.name.trim(),
      description: form.description || null,
      location: form.location || null,
      client: form.client || null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      total_budget: totalBudget,
      currency: form.currency,
      created_by: user.id,
      is_template: saveAsTemplate,
      template_id: templateId,
    }).select().single()

    if (error || !project) {
      console.error("[nuevo proyecto] insert projects", { error, payload: { totalBudget, templateId } })
      toast("error", formatSupabaseError(error, "Error al crear el proyecto"))
      setLoading(false)
      return
    }

    // Add creator as admin
    await supabase.from("project_members").insert({
      project_id: project.id,
      user_id: user.id,
      role: "admin",
    })

    let orderIndex = 0
    for (const g of groups) {
      const groupName = g.name.trim()
      const validLines = g.lines.filter((l) => l.name.trim())
      if (validLines.length === 0) continue

      if (groupName) {
        const { data: parentRow, error: pErr } = await supabase
          .from("budget_categories")
          .insert({
            project_id: project.id,
            name: groupName,
            description: g.description.trim() || null,
            budget_amount: 0,
            parent_id: null,
            order_index: orderIndex,
          })
          .select("id")
          .single()
        if (pErr || !parentRow) {
          toast("error", formatSupabaseError(pErr, "Error al crear la categor?a de presupuesto"))
          setLoading(false)
          return
        }
        orderIndex += 1
        const parentId = parentRow.id as string
        for (const line of validLines) {
          const { error: cErr } = await supabase.from("budget_categories").insert({
            project_id: project.id,
            name: line.name.trim(),
            description: line.description.trim() || null,
            budget_amount: parseFloat(line.budget_amount) || 0,
            parent_id: parentId,
            order_index: orderIndex,
          })
          if (cErr) {
            toast("error", formatSupabaseError(cErr, "Error al crear un rengl?n"))
            setLoading(false)
            return
          }
          orderIndex += 1
        }
      } else {
        for (const line of validLines) {
          const { error: cErr } = await supabase.from("budget_categories").insert({
            project_id: project.id,
            name: line.name.trim(),
            description: line.description.trim() || null,
            budget_amount: parseFloat(line.budget_amount) || 0,
            parent_id: null,
            order_index: orderIndex,
          })
          if (cErr) {
            toast("error", formatSupabaseError(cErr, "Error al crear un rengl?n"))
            setLoading(false)
            return
          }
          orderIndex += 1
        }
      }
    }

    // Log
    await supabase.from("project_logs").insert({
      project_id: project.id,
      user_id: user.id,
      action: "project_created",
      details: { name: project.name, template: saveAsTemplate },
    })

    toast("success", saveAsTemplate ? "Proyecto creado y guardado como plantilla" : "Proyecto creado exitosamente")
    router.push(`/projects/${project.id}`)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 animate-in sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        <Link href="/dashboard" className="shrink-0 self-start">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" /> Volver
          </Button>
        </Link>
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-gray-900 sm:text-xl">Nuevo proyecto</h1>
          <p className="text-sm text-gray-500">{"Define las caracter\u00edsticas y renglones del presupuesto"}</p>
        </div>
      </div>

      {/* Template selector */}
      {templates.length > 0 && (
        <Card>
          <CardContent className="pt-5">
            <Select
              label="Cargar desde plantilla (opcional)"
              options={templates.map((t) => ({ value: t.id, label: t.name }))}
              placeholder="Selecciona una plantilla..."
              value={selectedTemplate}
              onChange={(e) => {
                setSelectedTemplate(e.target.value)
                loadTemplate(e.target.value)
              }}
            />
          </CardContent>
        </Card>
      )}

      <form onSubmit={handleSubmit}>
        {/* Project info */}
        <Card className="mb-4">
          <CardHeader>
            <h2 className="text-sm font-semibold text-gray-900">{"Informaci\u00f3n del proyecto"}</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              label="Nombre del proyecto *"
              placeholder={"Ej: Construcci\u00f3n Residencial Las Flores"}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
            <Textarea
              label={"Descripci\u00f3n"}
              placeholder={"Descripci\u00f3n general del proyecto..."}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Cliente"
                placeholder="Nombre del cliente"
                value={form.client}
                onChange={(e) => setForm({ ...form, client: e.target.value })}
              />
              <Input
                label={"Ubicaci\u00f3n"}
                placeholder="Ciudad, Departamento"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Input
                label="Fecha inicio"
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              />
              <Input
                label="Fecha fin"
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              />
              <Select
                label="Moneda"
                options={[
                  { value: "GTQ", label: "GTQ - Quetzal" },
                  { value: "USD", label: "USD - D\u00f3lar" },
                ]}
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>

        {/* Budget categories */}
        <Card className="mb-4">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-gray-900">Categor?as y renglones del presupuesto</h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  Crea una categor?a (ej. <span className="font-medium">Materiales</span>) y a?ade renglones debajo (ej. Piedra, Agua). Si
                  dejas el nombre de categor?a vac?o, los renglones quedan al primer nivel como antes.
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  CSV: <span className="font-mono">nombre,monto,descripcion</span> (cabecera opcional); se cargan en un bloque. Puedes
                  nombrar la categor?a despu?s.
                </p>
              </div>
              <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row">
                <input
                  ref={csvInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={onCsvSelected}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => csvInputRef.current?.click()}
                  className="w-full sm:w-auto"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Importar CSV
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={addGroup} className="w-full sm:w-auto">
                  <FolderPlus className="h-3.5 w-3.5" /> Nueva categor?a
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {groups.map((group) => (
              <div key={group.id} className="rounded-xl border border-gray-200 bg-gray-50/80 p-3 shadow-sm sm:p-4">
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-2">
                    <Input
                      label="Nombre de la categor?a (opcional)"
                      placeholder="Ej. Materiales, Mano de obra?"
                      value={group.name}
                      onChange={(e) => updateGroup(group.id, "name", e.target.value)}
                    />
                    <Input
                      placeholder="Nota o descripci?n de la categor?a (opcional)"
                      value={group.description}
                      onChange={(e) => updateGroup(group.id, "description", e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeGroup(group.id)}
                    disabled={groups.length === 1}
                    className="self-end shrink-0 text-gray-300 transition-colors hover:text-red-400 disabled:opacity-30 sm:self-start"
                    aria-label="Eliminar categor?a"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <p className="mb-2 text-xs font-medium text-gray-600">Renglones</p>
                <div className="space-y-3">
                  {group.lines.map((line, lineIdx) => (
                    <div key={line.id} className="flex flex-col gap-3 rounded-lg border border-gray-100 bg-white p-3 sm:flex-row sm:items-start">
                      <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
                        <Input
                          placeholder={`Rengl?n ${lineIdx + 1} *`}
                          value={line.name}
                          onChange={(e) => updateLine(group.id, line.id, "name", e.target.value)}
                        />
                        <Input
                          placeholder="Presupuesto asignado"
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.budget_amount}
                          onChange={(e) => updateLine(group.id, line.id, "budget_amount", e.target.value)}
                        />
                        <Input
                          className="col-span-2"
                          placeholder={"Descripci\u00f3n del rengl\u00f3n (opcional)"}
                          value={line.description}
                          onChange={(e) => updateLine(group.id, line.id, "description", e.target.value)}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeLine(group.id, line.id)}
                        className="self-end text-gray-300 transition-colors hover:text-red-400 sm:mt-2 sm:self-start"
                        aria-label="Eliminar rengl?n"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-3 w-full sm:w-auto"
                  onClick={() => addLineToGroup(group.id)}
                >
                  <Plus className="h-3.5 w-3.5" /> Agregar rengl?n
                </Button>
              </div>
            ))}
          </CardContent>
          <CardFooter>
            <div className="flex w-full flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <span className="text-gray-500">Presupuesto total calculado:</span>
              <span className="font-bold text-gray-900 sm:text-right">
                {new Intl.NumberFormat("es-GT", { style: "currency", currency: form.currency }).format(
                  groups.reduce((s, g) => s + g.lines.reduce((t, l) => t + (parseFloat(l.budget_amount) || 0), 0), 0)
                )}
              </span>
            </div>
          </CardFooter>
        </Card>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={(e) => handleSubmit(e, true)}
            loading={loading}
          >
            Crear y guardar como plantilla
          </Button>
          <Button type="submit" className="w-full sm:w-auto" loading={loading}>
            Crear proyecto
          </Button>
        </div>
      </form>
    </div>
  )
}
