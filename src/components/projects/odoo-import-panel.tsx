"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { useToast } from "@/components/ui/toast"
import { formatCurrency, cn } from "@/lib/utils"
import type { OdooDocKind, OdooImportRow, OdooPurchaseOrderRow } from "@/lib/odoo/import-records"
import { Download, Package, Receipt, RefreshCw } from "lucide-react"

type Opt = { value: string; label: string }

const DOC_KINDS: { id: OdooDocKind; label: string }[] = [
  { id: "vendor_bill", label: "Facturas proveedor" },
  { id: "vendor_credit", label: "Notas crédito proveedor" },
  { id: "customer_invoice", label: "Facturas cliente" },
  { id: "customer_credit", label: "Notas crédito cliente" },
  { id: "payment_out", label: "Pagos salientes" },
  { id: "payment_in", label: "Pagos entrantes" },
]

function keyForDoc(r: OdooImportRow) {
  return `${r.model}:${r.odooId}`
}

function defaultOdooImportDateRange() {
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), 1)
  return {
    from: start.toISOString().slice(0, 10),
    to: today.toISOString().slice(0, 10),
  }
}

export function OdooImportPanel({
  projectId,
  currency,
  categoryOptions,
  expenseTypeOptions,
  incomeTypeOptions,
  canImport,
  profileOdooConfigured,
  savedOdooCompanyId,
}: {
  projectId: string
  currency: string
  categoryOptions: Opt[]
  expenseTypeOptions: Opt[]
  incomeTypeOptions: Opt[]
  canImport: boolean
  profileOdooConfigured: boolean
  savedOdooCompanyId: number | null
}) {
  const { toast } = useToast()
  const router = useRouter()
  const [kinds, setKinds] = useState<Set<OdooDocKind>>(() => new Set(DOC_KINDS.map((d) => d.id)))
  const [docRows, setDocRows] = useState<OdooImportRow[]>([])
  const [docWarnings, setDocWarnings] = useState<string[]>([])
  const [docLoading, setDocLoading] = useState(false)
  const [importing, setImporting] = useState(false)

  const [poRows, setPoRows] = useState<OdooPurchaseOrderRow[]>([])
  const [poLoading, setPoLoading] = useState(false)
  const [poImporting, setPoImporting] = useState(false)

  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set())
  const [docCategory, setDocCategory] = useState<Record<string, string>>({})
  const [docTxType, setDocTxType] = useState<Record<string, string>>({})

  const [selectedPo, setSelectedPo] = useState<Set<number>>(new Set())
  const [poCategory, setPoCategory] = useState<Record<number, string>>({})

  const range0 = useMemo(() => defaultOdooImportDateRange(), [])
  const [dateFrom, setDateFrom] = useState(range0.from)
  const [dateTo, setDateTo] = useState(range0.to)
  const [companies, setCompanies] = useState<{ id: number; name: string }[]>([])
  const [companiesLoading, setCompaniesLoading] = useState(false)
  const [companyId, setCompanyId] = useState("")

  const persistCompanyId = async (id: number) => {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase
      .from("user_odoo_settings")
      .update({ odoo_company_id: id, updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
    if (error) {
      toast("error", "No se pudo guardar la empresa en tu perfil")
      return
    }
    router.refresh()
  }

  const refreshCompanies = async (opts?: { announce?: boolean }) => {
    setCompaniesLoading(true)
    try {
      const res = await fetch("/api/odoo/companies", { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        toast("error", data.message || "No se pudieron cargar las empresas de Odoo")
        setCompanies([])
        setCompanyId("")
        return
      }
      const list = (data.companies || []) as { id: number; name: string }[]
      setCompanies(list)
      let next = ""
      if (savedOdooCompanyId != null && list.some((c) => c.id === savedOdooCompanyId)) {
        next = String(savedOdooCompanyId)
      } else if (list.length === 1) {
        next = String(list[0].id)
        await persistCompanyId(list[0].id)
      }
      setCompanyId(next)
      if (opts?.announce) toast("success", `${list.length} empresa(s) cargadas desde Odoo`)
    } finally {
      setCompaniesLoading(false)
    }
  }

  useEffect(() => {
    void refreshCompanies()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carga inicial de empresas Odoo
  }, [])

  useEffect(() => {
    if (savedOdooCompanyId == null) return
    if (!companies.some((c) => c.id === savedOdooCompanyId)) return
    setCompanyId(String(savedOdooCompanyId))
  }, [savedOdooCompanyId, companies])

  const companyOptions = useMemo(
    () => [{ value: "", label: "Elige empresa…" }, ...companies.map((c) => ({ value: String(c.id), label: c.name }))],
    [companies]
  )

  const odooFiltersReady =
    Number.isFinite(Number(companyId)) && Number(companyId) > 0 && dateFrom.trim() !== "" && dateTo.trim() !== ""

  const defaultExpenseCat = categoryOptions[0]?.value ?? ""
  const defaultIncomeCat = categoryOptions[0]?.value ?? ""
  const defaultExpenseTx = expenseTypeOptions[0]?.value ?? ""
  const defaultIncomeTx = incomeTypeOptions[0]?.value ?? ""

  const toggleKind = (id: OdooDocKind) => {
    setKinds((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const loadDocuments = async () => {
    if (kinds.size === 0) {
      toast("error", "Selecciona al menos un tipo de documento")
      return
    }
    const cid = Number(companyId)
    if (!Number.isFinite(cid) || cid <= 0) {
      toast("error", "Selecciona una empresa Odoo")
      return
    }
    if (!dateFrom.trim() || !dateTo.trim()) {
      toast("error", "Indica fecha desde y hasta")
      return
    }
    setDocLoading(true)
    setDocWarnings([])
    try {
      const res = await fetch(`/api/projects/${projectId}/odoo/list`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kinds: [...kinds],
          companyId: cid,
          dateFrom: dateFrom.trim(),
          dateTo: dateTo.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast("error", data.message || "Error al cargar Odoo")
        setDocRows([])
        return
      }
      setDocRows(data.rows || [])
      setDocWarnings(data.warnings || [])
      setSelectedDocs(new Set())
      const cat: Record<string, string> = {}
      const tx: Record<string, string> = {}
      for (const r of data.rows || []) {
        const k = keyForDoc(r)
        cat[k] = r.flow === "expense" ? defaultExpenseCat : defaultIncomeCat
        tx[k] = r.flow === "expense" ? defaultExpenseTx : defaultIncomeTx
      }
      setDocCategory(cat)
      setDocTxType(tx)
      toast("success", `${(data.rows || []).length} documentos cargados`)
    } finally {
      setDocLoading(false)
    }
  }

  const importDocuments = async () => {
    const keys = [...selectedDocs]
    if (keys.length === 0) {
      toast("error", "Selecciona al menos un documento")
      return
    }
    const items = []
    for (const k of keys) {
      const row = docRows.find((r) => keyForDoc(r) === k)
      if (!row) continue
      const categoryId = docCategory[k] || ""
      const transactionTypeId = docTxType[k] || ""
      if (!categoryId || !transactionTypeId) {
        toast("error", "Asigna categoría y tipo a todos los seleccionados")
        return
      }
      items.push({
        odooId: row.odooId,
        model: row.model,
        kind: row.kind,
        label: row.label,
        name: row.name,
        date: row.date,
        amount: row.amount,
        flow: row.flow,
        partnerName: row.partnerName,
        categoryId,
        transactionTypeId,
      })
    }
    if (items.length === 0) return
    setImporting(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/odoo/import-transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast("error", data.message || "Error al importar")
        return
      }
      const parts = [`Importadas: ${data.imported}`]
      if (data.skipped?.length) parts.push(`Omitidas (ya existían): ${data.skipped.length}`)
      toast("success", parts.join(" · "))
      if (data.errors?.length) {
        toast("error", data.errors.slice(0, 2).join(" — "))
      }
      router.refresh()
      setSelectedDocs(new Set())
      await loadDocuments()
    } finally {
      setImporting(false)
    }
  }

  const loadPurchaseOrders = async () => {
    const cid = Number(companyId)
    if (!Number.isFinite(cid) || cid <= 0) {
      toast("error", "Selecciona una empresa Odoo")
      return
    }
    if (!dateFrom.trim() || !dateTo.trim()) {
      toast("error", "Indica fecha desde y hasta")
      return
    }
    setPoLoading(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/odoo/purchase-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: cid,
          dateFrom: dateFrom.trim(),
          dateTo: dateTo.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast("error", data.message || "Error al cargar órdenes de compra")
        setPoRows([])
        return
      }
      setPoRows(data.rows || [])
      setSelectedPo(new Set())
      const pc: Record<number, string> = {}
      for (const r of data.rows || []) {
        pc[r.odooId] = defaultExpenseCat
      }
      setPoCategory(pc)
      toast("success", `${(data.rows || []).length} órdenes de compra cargadas`)
    } finally {
      setPoLoading(false)
    }
  }

  const importPurchaseOrders = async () => {
    const ids = [...selectedPo]
    if (ids.length === 0) {
      toast("error", "Selecciona al menos una orden")
      return
    }
    const items = []
    for (const id of ids) {
      const row = poRows.find((r) => r.odooId === id)
      if (!row) continue
      const categoryId = poCategory[id] || ""
      if (!categoryId) {
        toast("error", "Asigna categoría a cada orden seleccionada")
        return
      }
      items.push({
        odooId: row.odooId,
        name: row.name,
        amount: row.amount,
        partnerName: row.partnerName,
        categoryId,
        title: `OC Odoo ${row.name}`,
      })
    }
    setPoImporting(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/odoo/import-reservations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast("error", data.message || "Error al importar compromisos")
        return
      }
      toast("success", `Compromisos creados: ${data.imported}${data.skipped?.length ? ` · omitidas: ${data.skipped.length}` : ""}`)
      if (data.errors?.length) toast("error", data.errors[0])
      router.refresh()
      setSelectedPo(new Set())
      await loadPurchaseOrders()
    } finally {
      setPoImporting(false)
    }
  }

  const docTypeOptionsForRow = useMemo(
    () => ({
      expense: expenseTypeOptions,
      income: incomeTypeOptions,
    }),
    [expenseTypeOptions, incomeTypeOptions]
  )

  if (!profileOdooConfigured) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-gray-600">
          <p className="font-medium text-gray-900">Configura Odoo en tu perfil</p>
          <p className="mt-2">Necesitas URL, base de datos (si no es *.odoo.com), correo y contraseña.</p>
          <Link href="/profile" className="mt-4 inline-block text-indigo-600 hover:underline">
            Ir a Mi perfil
          </Link>
        </CardContent>
      </Card>
    )
  }

  if (categoryOptions.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-gray-600">
          Define renglones de presupuesto en la pestaña Presupuesto antes de importar desde Odoo.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-8">
      <Card className="border-[#875A7B]/15">
        <CardHeader>
          <h2 className="text-sm font-semibold text-gray-900">Empresa Odoo y período</h2>
          <p className="text-xs text-gray-500">
            Las importaciones usan una empresa y un rango de fechas para no descargar toda la base. La empresa elegida se
            guarda en tu perfil como predeterminada.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="min-w-[14rem] flex-1">
              <Select
                label="Empresa"
                options={companyOptions}
                value={companyId}
                onChange={(e) => {
                  const v = e.target.value
                  setCompanyId(v)
                  const n = Number(v)
                  if (Number.isFinite(n) && n > 0) void persistCompanyId(n)
                }}
                className="text-sm"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => void refreshCompanies({ announce: true })}
              loading={companiesLoading}
              className="shrink-0 border-[#875A7B]/30"
            >
              <RefreshCw className="h-4 w-4" /> Actualizar empresas
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Desde" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <Input label="Hasta" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Receipt className="h-5 w-5 text-[#875A7B]" />
            <h2 className="text-sm font-semibold text-gray-900">Documentos contables → Transacciones</h2>
          </div>
          <p className="text-xs text-gray-500">
            Odoo expone facturas, notas y pagos vía JSON-RPC con tus credenciales del perfil. Elige renglón y tipo de
            movimiento antes de importar (solo referencia; revisa montos y fechas en Odoo).
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {DOC_KINDS.map((d) => (
              <label
                key={d.id}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs",
                  kinds.has(d.id) ? "border-[#875A7B] bg-[#875A7B]/5 text-[#5b4a5c]" : "border-gray-200 text-gray-600"
                )}
              >
                <input
                  type="checkbox"
                  className="rounded border-gray-300"
                  checked={kinds.has(d.id)}
                  onChange={() => toggleKind(d.id)}
                />
                {d.label}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={loadDocuments}
              loading={docLoading}
              disabled={!canImport || !odooFiltersReady}
            >
              <Download className="h-4 w-4" /> Cargar desde Odoo
            </Button>
            <Button
              type="button"
              onClick={importDocuments}
              loading={importing}
              disabled={!canImport || selectedDocs.size === 0}
              className="bg-[#875A7B] hover:bg-[#6d4f62]"
            >
              Importar seleccionadas como transacciones
            </Button>
          </div>
          {!canImport && (
            <p className="text-xs text-amber-800">Solo administradores y trabajadores pueden importar (o el proyecto está archivado).</p>
          )}
          {docWarnings.length > 0 && (
            <ul className="list-inside list-disc text-xs text-amber-800">
              {docWarnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
          {docRows.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full min-w-[56rem] text-left text-sm">
                <thead className="border-b border-gray-100 bg-gray-50 text-xs font-medium text-gray-500">
                  <tr>
                    <th className="px-3 py-2 w-10">
                      <input
                        type="checkbox"
                        aria-label="Seleccionar todas"
                        checked={selectedDocs.size === docRows.length && docRows.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedDocs(new Set(docRows.map(keyForDoc)))
                          else setSelectedDocs(new Set())
                        }}
                      />
                    </th>
                    <th className="px-3 py-2">Fecha</th>
                    <th className="px-3 py-2">Documento</th>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2 text-right">Monto</th>
                    <th className="px-3 py-2">Renglón</th>
                    <th className="px-3 py-2">Tipo transacción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {docRows.map((r) => {
                    const k = keyForDoc(r)
                    return (
                      <tr key={k} className="hover:bg-gray-50/80">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selectedDocs.has(k)}
                            onChange={(e) => {
                              setSelectedDocs((prev) => {
                                const n = new Set(prev)
                                if (e.target.checked) n.add(k)
                                else n.delete(k)
                                return n
                              })
                            }}
                          />
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-600">{r.date || "—"}</td>
                        <td className="px-3 py-2">
                          <p className="font-medium text-gray-900">{r.name}</p>
                          <p className="text-xs text-gray-500">{r.partnerName || "—"}</p>
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={cn(
                              "rounded px-2 py-0.5 text-xs",
                              r.flow === "expense" ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"
                            )}
                          >
                            {r.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.amount, currency)}</td>
                        <td className="px-3 py-2 min-w-[10rem]">
                          <Select
                            options={categoryOptions}
                            value={docCategory[k] || ""}
                            onChange={(e) => setDocCategory((prev) => ({ ...prev, [k]: e.target.value }))}
                            className="text-xs py-1"
                          />
                        </td>
                        <td className="px-3 py-2 min-w-[10rem]">
                          <Select
                            options={docTypeOptionsForRow[r.flow]}
                            value={docTxType[k] || ""}
                            onChange={(e) => setDocTxType((prev) => ({ ...prev, [k]: e.target.value }))}
                            className="text-xs py-1"
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Package className="h-5 w-5 text-indigo-600" />
            <h2 className="text-sm font-semibold text-gray-900">Órdenes de compra → Compromisos</h2>
          </div>
          <p className="text-xs text-gray-500">
            Importa órdenes confirmadas o recibidas en Odoo como compromisos de presupuesto en el renglón que elijas.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={loadPurchaseOrders}
              loading={poLoading}
              disabled={!canImport || !odooFiltersReady}
            >
              <Download className="h-4 w-4" /> Cargar órdenes de compra
            </Button>
            <Button type="button" onClick={importPurchaseOrders} loading={poImporting} disabled={!canImport || selectedPo.size === 0}>
              Importar seleccionadas como compromisos
            </Button>
          </div>
          {poRows.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead className="border-b border-gray-100 bg-gray-50 text-xs font-medium text-gray-500">
                  <tr>
                    <th className="px-3 py-2 w-10">
                      <input
                        type="checkbox"
                        aria-label="Seleccionar todas OC"
                        checked={selectedPo.size === poRows.length && poRows.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedPo(new Set(poRows.map((r) => r.odooId)))
                          else setSelectedPo(new Set())
                        }}
                      />
                    </th>
                    <th className="px-3 py-2">Orden</th>
                    <th className="px-3 py-2">Fecha</th>
                    <th className="px-3 py-2">Proveedor</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2">Renglón</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {poRows.map((r) => (
                    <tr key={r.odooId} className="hover:bg-gray-50/80">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedPo.has(r.odooId)}
                          onChange={(e) => {
                            setSelectedPo((prev) => {
                              const n = new Set(prev)
                              if (e.target.checked) n.add(r.odooId)
                              else n.delete(r.odooId)
                              return n
                            })
                          }}
                        />
                      </td>
                      <td className="px-3 py-2 font-medium text-gray-900">{r.name}</td>
                      <td className="px-3 py-2 text-gray-600">{r.date || "—"}</td>
                      <td className="px-3 py-2 text-gray-600">{r.partnerName || "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.amount, currency)}</td>
                      <td className="px-3 py-2 min-w-[10rem]">
                        <Select
                          options={categoryOptions}
                          value={poCategory[r.odooId] || ""}
                          onChange={(e) => setPoCategory((prev) => ({ ...prev, [r.odooId]: e.target.value }))}
                          className="text-xs py-1"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-gray-400">
        Notas de débito u otros asientos pueden aparecer como factura de proveedor según la configuración de tu Odoo. Si tu
        plan Odoo restringe la API externa, contacta al administrador de la instancia.
      </p>
    </div>
  )
}
