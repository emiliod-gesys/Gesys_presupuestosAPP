"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardFooter } from "@/components/ui/card"
import { useToast } from "@/components/ui/toast"
import { ArrowLeft, Plus, Trash2 } from "lucide-react"
import Link from "next/link"

interface CategoryRow {
  id: string
  name: string
  description: string
  budget_amount: string
}

interface Template {
  id: string
  name: string
}

export default function NewProjectPage() {
  const router = useRouter()
  const { toast } = useToast()
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

  const [categories, setCategories] = useState<CategoryRow[]>([
    { id: "1", name: "", description: "", budget_amount: "" },
  ])

  useEffect(() => {
    const loadTemplates = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from("projects")
        .select("id, name")
        .eq("is_template", true)
        .or(`created_by.eq.${user.id}`)
      setTemplates(data || [])
    }
    loadTemplates()
  }, [])

  const loadTemplate = async (templateId: string) => {
    if (!templateId) return
    const supabase = createClient()
    const { data: cats } = await supabase
      .from("budget_categories")
      .select("name, description, budget_amount")
      .eq("project_id", templateId)
      .order("order_index")
    if (cats?.length) {
      setCategories(cats.map((c, i) => ({
        id: String(i + 1),
        name: c.name,
        description: c.description || "",
        budget_amount: String(c.budget_amount),
      })))
    }
  }

  const addCategory = () => {
    setCategories([...categories, { id: Date.now().toString(), name: "", description: "", budget_amount: "" }])
  }

  const removeCategory = (id: string) => {
    if (categories.length === 1) return
    setCategories(categories.filter((c) => c.id !== id))
  }

  const updateCategory = (id: string, field: keyof CategoryRow, value: string) => {
    setCategories(categories.map((c) => c.id === id ? { ...c, [field]: value } : c))
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

    const totalBudget = categories.reduce((sum, c) => sum + (parseFloat(c.budget_amount) || 0), 0)

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
      template_id: selectedTemplate || null,
    }).select().single()

    if (error || !project) {
      toast("error", "Error al crear el proyecto")
      setLoading(false)
      return
    }

    // Add creator as admin
    await supabase.from("project_members").insert({
      project_id: project.id,
      user_id: user.id,
      role: "admin",
    })

    // Add categories
    const validCats = categories.filter((c) => c.name.trim())
    if (validCats.length > 0) {
      await supabase.from("budget_categories").insert(
        validCats.map((c, i) => ({
          project_id: project.id,
          name: c.name.trim(),
          description: c.description || null,
          budget_amount: parseFloat(c.budget_amount) || 0,
          order_index: i,
        }))
      )
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
    <div className="max-w-3xl mx-auto space-y-6 animate-in">
      <div className="flex items-center gap-3">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" /> Volver
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Nuevo proyecto</h1>
          <p className="text-sm text-gray-500">Define las características y renglones del presupuesto</p>
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
            <h2 className="text-sm font-semibold text-gray-900">Información del proyecto</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              label="Nombre del proyecto *"
              placeholder="Ej: Construcción Residencial Las Flores"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
            <Textarea
              label="Descripción"
              placeholder="Descripción general del proyecto..."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Cliente"
                placeholder="Nombre del cliente"
                value={form.client}
                onChange={(e) => setForm({ ...form, client: e.target.value })}
              />
              <Input
                label="Ubicación"
                placeholder="Ciudad, Departamento"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
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
                  { value: "USD", label: "USD - Dólar" },
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
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Renglones del presupuesto</h2>
                <p className="text-xs text-gray-500 mt-0.5">El presupuesto total se calculará automáticamente</p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={addCategory}>
                <Plus className="h-3.5 w-3.5" /> Agregar renglón
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {categories.map((cat, idx) => (
              <div key={cat.id} className="flex gap-3 items-start p-3 bg-gray-50 rounded-lg">
                <div className="flex-1 grid grid-cols-2 gap-3">
                  <Input
                    placeholder={`Renglón ${idx + 1} *`}
                    value={cat.name}
                    onChange={(e) => updateCategory(cat.id, "name", e.target.value)}
                  />
                  <Input
                    placeholder="Presupuesto asignado"
                    type="number"
                    min="0"
                    step="0.01"
                    value={cat.budget_amount}
                    onChange={(e) => updateCategory(cat.id, "budget_amount", e.target.value)}
                  />
                  <Input
                    className="col-span-2"
                    placeholder="Descripción del renglón (opcional)"
                    value={cat.description}
                    onChange={(e) => updateCategory(cat.id, "description", e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeCategory(cat.id)}
                  disabled={categories.length === 1}
                  className="text-gray-300 hover:text-red-400 transition-colors mt-2 disabled:opacity-30"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </CardContent>
          <CardFooter>
            <div className="flex justify-between items-center w-full text-sm">
              <span className="text-gray-500">Presupuesto total calculado:</span>
              <span className="font-bold text-gray-900">
                {new Intl.NumberFormat("es-GT", { style: "currency", currency: form.currency }).format(
                  categories.reduce((s, c) => s + (parseFloat(c.budget_amount) || 0), 0)
                )}
              </span>
            </div>
          </CardFooter>
        </Card>

        <div className="flex gap-3 justify-end">
          <Button type="button" variant="outline" onClick={(e) => handleSubmit(e, true)} loading={loading}>
            Crear y guardar como plantilla
          </Button>
          <Button type="submit" loading={loading}>
            Crear proyecto
          </Button>
        </div>
      </form>
    </div>
  )
}
