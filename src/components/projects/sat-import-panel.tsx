"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { useToast } from "@/components/ui/toast"
import { formatCurrency, cn } from "@/lib/utils"
import type { SatDteListRow, SatFelCheckpoint, SatFelRunDiagnostics } from "@/lib/sat-gt/fel-types"
import { Download, FileSpreadsheet } from "lucide-react"

type Opt = { value: string; label: string }

function defaultSatDateRange() {
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), 1)
  return {
    from: start.toISOString().slice(0, 10),
    to: today.toISOString().slice(0, 10),
  }
}

export function SatImportPanel({
  projectId,
  currency,
  categoryOptions,
  expenseTypeOptions,
  incomeTypeOptions,
  canImport,
  profileSatConfigured,
}: {
  projectId: string
  currency: string
  categoryOptions: Opt[]
  expenseTypeOptions: Opt[]
  incomeTypeOptions: Opt[]
  canImport: boolean
  profileSatConfigured: boolean
}) {
  const { toast } = useToast()
  const router = useRouter()
  const range0 = useMemo(() => defaultSatDateRange(), [])
  const utcTodayIso = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const [dateFrom, setDateFrom] = useState(range0.from)
  const [dateTo, setDateTo] = useState(range0.to)
  const [rows, setRows] = useState<SatDteListRow[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [diagnostics, setDiagnostics] = useState<SatFelRunDiagnostics | null>(null)
  const [importCheckpoints, setImportCheckpoints] = useState<SatFelCheckpoint[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [rowCategory, setRowCategory] = useState<Record<string, string>>({})
  const [rowTxType, setRowTxType] = useState<Record<string, string>>({})

  const defaultExpenseCat = categoryOptions[0]?.value ?? ""
  const defaultIncomeCat = categoryOptions[0]?.value ?? ""
  const defaultExpenseTx = expenseTypeOptions[0]?.value ?? ""
  const defaultIncomeTx = incomeTypeOptions[0]?.value ?? ""

  const rowKey = (r: SatDteListRow) => `${r.flow}:${r.uuid}`

  const filtersReady = dateFrom.trim() !== "" && dateTo.trim() !== ""
  const dateToAfterUtcToday = filtersReady && dateTo > utcTodayIso

  const loadFromSat = async () => {
    if (!filtersReady) {
      toast("error", "Indica fecha desde y hasta")
      return
    }
    setLoading(true)
    setWarnings([])
    setDiagnostics(null)
    setImportCheckpoints(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/sat/list`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dateFrom: dateFrom.trim(), dateTo: dateTo.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast("error", data.message || "No se pudo consultar el SAT")
        setRows([])
        return
      }
      const list = (data.rows || []) as SatDteListRow[]
      const diag = data.diagnostics as SatFelRunDiagnostics | undefined
      setRows(list)
      setWarnings(Array.isArray(data.warnings) ? data.warnings : [])
      setDiagnostics(diag && typeof diag === "object" ? diag : null)
      setSelected(new Set())
      const cat: Record<string, string> = {}
      const tx: Record<string, string> = {}
      for (const r of list) {
        const k = rowKey(r)
        if (r.anulado) continue
        cat[k] = r.flow === "expense" ? defaultExpenseCat : defaultIncomeCat
        tx[k] = r.flow === "expense" ? defaultExpenseTx : defaultIncomeTx
      }
      setRowCategory(cat)
      setRowTxType(tx)
      if (list.length === 0) {
        toast(
          "error",
          "No hay facturas listadas para importar. Revisa el diagnóstico abajo (usuario= en la API, rango de fechas y mensaje del SAT)."
        )
      } else {
        toast("success", `${list.length} DTE en el período`)
      }
    } finally {
      setLoading(false)
    }
  }

  const importSelected = async () => {
    const keys = [...selected]
    if (keys.length === 0) {
      toast("error", "Selecciona al menos un DTE")
      return
    }
    const items = []
    for (const k of keys) {
      const row = rows.find((r) => rowKey(r) === k)
      if (!row || row.anulado) continue
      const categoryId = rowCategory[k] || ""
      const transactionTypeId = rowTxType[k] || ""
      if (!categoryId || !transactionTypeId) {
        toast("error", "Asigna categoría y tipo a todos los seleccionados")
        return
      }
      items.push({
        uuid: row.uuid,
        flow: row.flow,
        label: row.label,
        name: row.name,
        date: row.date,
        amount: row.amount,
        partnerName: row.partnerName,
        categoryId,
        transactionTypeId,
      })
    }
    if (items.length === 0) return
    setImporting(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/sat/import-transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast("error", data.message || "Error al importar")
        const ic = data.checkpoints as SatFelCheckpoint[] | undefined
        setImportCheckpoints(Array.isArray(ic) ? ic : null)
        return
      }
      const ic = data.checkpoints as SatFelCheckpoint[] | undefined
      setImportCheckpoints(Array.isArray(ic) ? ic : null)
      const parts = [`Importadas: ${data.imported}`]
      if (data.skipped?.length) parts.push(`omitidas (ya existían): ${data.skipped.length}`)
      toast("success", parts.join(". "))
      if (Array.isArray(data.errors) && data.errors.length) {
        toast("error", data.errors.slice(0, 3).join(" · "))
      }
      router.refresh()
      setSelected(new Set())
    } finally {
      setImporting(false)
    }
  }

  if (!profileSatConfigured) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-gray-600">
          <p className="font-medium text-gray-900">Configura el portal SAT en tu perfil</p>
          <p className="mt-2">Necesitas NIT, contraseña del portal y, si aplica, usuario distinto al NIT.</p>
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
          Define renglones de presupuesto en la pestaña Presupuesto antes de importar DTE del SAT.
        </CardContent>
      </Card>
    )
  }

  const selectableRows = rows.filter((r) => !r.anulado)

  return (
    <div className="space-y-8">
      <Card className="border-emerald-800/15">
        <CardHeader>
          <h2 className="text-sm font-semibold text-gray-900">Período de consulta DTE</h2>
          <p className="text-xs text-gray-500">
            La extracción abre una sesión en el portal del SAT (Puppeteer) y consulta la API de consulta DTE. Puede tardar
            uno o varios minutos según el rango y la carga del portal.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Desde" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <Input label="Hasta" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <p className="text-xs text-gray-600">
            Rango que se envía al SAT (orden calendario ISO, año-mes-día):{" "}
            <span className="font-mono text-[11px]">{dateFrom || "—"}</span> →{" "}
            <span className="font-mono text-[11px]">{dateTo || "—"}</span>. El control puede verse en formato local, pero
            el valor es siempre <strong>YYYY-MM-DD</strong>.
          </p>
          {dateToAfterUtcToday && (
            <p className="text-xs text-amber-950 bg-amber-100/90 rounded-lg px-3 py-2 border border-amber-200">
              «Hasta» es posterior a hoy en UTC (<span className="font-mono">{utcTodayIso}</span>). El SAT no lista
              documentos con emisión futura: obtendrás <strong>total 0</strong> y lista vacía. Ajusta la fecha final al
              último día con facturas o a hoy.
            </p>
          )}
          <p className="text-xs text-amber-800 bg-amber-50/80 rounded-lg px-3 py-2 border border-amber-100">
            En Vercel/AWS Lambda se usa Chromium empaquetado (@sparticuz/chromium). En tu PC:{" "}
            <code className="text-[11px]">npx puppeteer browsers install chrome</code> si falla el navegador. Opcional:{" "}
            <code className="text-[11px]">SAT_PUPPETEER_HEADLESS=false</code>,{" "}
            <code className="text-[11px]">SAT_PACKAGED_CHROMIUM=1</code>. La API FEL usa fechas{" "}
            <strong>YYYY-MM-DD</strong> salvo que definas{" "}
            <code className="text-[11px]">SAT_FEL_TRY_DDMM=1</code> en el servidor (casi siempre el SAT devuelve error con
            dd/MM en la URL). La consulta DTE usa el mismo <span className="font-mono">usuario=</span> que el login del
            portal (criterio <span className="font-mono">reference/moore-rpa-main</span>), no el NIT por defecto.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-emerald-800" />
            <h2 className="text-sm font-semibold text-gray-900">DTE emitidos y recibidos → Transacciones</h2>
          </div>
          <p className="text-xs text-gray-500">
            Emitidas se importan como ingresos; recibidas como gastos. Elige renglón y tipo antes de importar. Los DTE
            anulados no se pueden seleccionar.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void loadFromSat()}
              loading={loading}
              disabled={!canImport || !filtersReady}
              className="border-emerald-800/30"
            >
              <Download className="h-4 w-4" /> Extraer del SAT
            </Button>
            <Button
              type="button"
              onClick={() => void importSelected()}
              loading={importing}
              disabled={!canImport || selected.size === 0}
              className="bg-emerald-800 hover:bg-emerald-900"
            >
              Importar seleccionadas como transacciones
            </Button>
          </div>
          {!canImport && (
            <p className="text-xs text-amber-800">
              Solo administradores y trabajadores pueden importar (o el proyecto está archivado).
            </p>
          )}
          {warnings.length > 0 && (
            <ul className="list-inside list-disc text-xs text-amber-800">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
          {diagnostics?.checkpoints && diagnostics.checkpoints.length > 0 && (
            <details className="rounded-lg border border-dashed border-gray-300 bg-white/60 p-3 text-xs">
              <summary className="cursor-pointer font-medium text-gray-800">
                Trazas del servidor — extracción SAT ({diagnostics.checkpoints.length} pasos)
              </summary>
              <p className="mt-2 text-[10px] text-gray-500">
                Tiempos relativos al inicio de la solicitud. No incluye secretos; sirve para ver en qué fase se detiene
                el flujo (navegador, consulta-dte, zip-xml, normalización).
              </p>
              <ul className="mt-2 max-h-48 overflow-y-auto font-mono text-[10px] text-gray-700 space-y-0.5">
                {diagnostics.checkpoints.map((c, i) => (
                  <li key={i}>
                    <span className="text-gray-400">+{c.atMs}ms</span> {c.stage}
                    {c.detail ? <span className="text-gray-600"> — {c.detail}</span> : null}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {importCheckpoints && importCheckpoints.length > 0 && (
            <details className="rounded-lg border border-dashed border-amber-200/80 bg-amber-50/40 p-3 text-xs">
              <summary className="cursor-pointer font-medium text-gray-800">
                Trazas del servidor — importación a transacciones ({importCheckpoints.length} pasos)
              </summary>
              <ul className="mt-2 max-h-40 overflow-y-auto font-mono text-[10px] text-gray-700 space-y-0.5">
                {importCheckpoints.map((c, i) => (
                  <li key={i}>
                    <span className="text-gray-400">+{c.atMs}ms</span> {c.stage}
                    {c.detail ? <span className="text-gray-600"> — {c.detail}</span> : null}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {diagnostics && rows.length === 0 && (
            <div className="rounded-lg border border-gray-200 bg-gray-50/90 p-4 text-xs text-gray-700 space-y-2">
              <p className="font-semibold text-gray-900">Diagnóstico de la consulta SAT</p>
              <p>
                Parámetro <span className="font-mono">usuario=</span> en la API (mismo criterio que{" "}
                <span className="font-mono">reference/moore-rpa-main</span>, login del portal):{" "}
                <span className="font-mono text-[11px]">{diagnostics.felConsultaUsuario}</span>
              </p>
              {diagnostics.felNitPerfil ? (
                <p className="text-gray-600">
                  NIT en tu perfil (referencia): <span className="font-mono text-[11px]">{diagnostics.felNitPerfil}</span>
                </p>
              ) : null}
              <p className="text-gray-600">
                Formato de fechas en la URL de la API:{" "}
                <span className="font-mono">{diagnostics.felDateFormatUsed ?? "iso"}</span>
                {(diagnostics.felDateFormatUsed ?? "iso") === "ddmmyyyy" && " (dd/MM/yyyy)"}
                {(diagnostics.felDateFormatUsed ?? "iso") === "iso" && " (YYYY-MM-DD)"}
              </p>
              <p className="text-gray-600">
                En compras (<span className="font-mono">R</span>), si guardaste un <strong>NIT</strong> en tu perfil, la
                API envía ese valor en <span className="font-mono">nitIdReceptor</span> automáticamente (muchas
                instalaciones del SAT lo requieren). Para dejarlo vacío como moore-rpa, define{" "}
                <span className="font-mono">SAT_FEL_OMIT_NIT_RECEPTOR=1</span> en el servidor. Sin NIT en perfil pero con{" "}
                <span className="font-mono">SAT_FEL_NIT_RECEPTOR_QUERY=1</span>, se usa el mismo texto que en{" "}
                <span className="font-mono">usuario=</span> en <span className="font-mono">nitIdReceptor</span>.
              </p>
              {diagnostics.queryWindow && (
                <p
                  className={
                    diagnostics.queryWindow.dateToAfterUtcToday
                      ? "rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-950"
                      : "text-gray-600"
                  }
                >
                  Ventana consultada (eco del servidor):{" "}
                  <span className="font-mono">{diagnostics.queryWindow.dateFrom}</span> →{" "}
                  <span className="font-mono">{diagnostics.queryWindow.dateTo}</span>
                  {diagnostics.queryWindow.dateToAfterUtcToday ? (
                    <>
                      {" "}
                      — «hasta» posterior a hoy UTC ({diagnostics.queryWindow.utcToday}), suele explicar total 0.
                    </>
                  ) : null}
                </p>
              )}
              <ul className="list-none space-y-1.5 font-mono text-[11px]">
                <li>
                  Emitidos (E): crudos {diagnostics.emitidos.rawListLength} → importables{" "}
                  {diagnostics.emitidos.normalizedCount}
                  {diagnostics.emitidos.satTotalRegistros != null &&
                    ` · total SAT ${diagnostics.emitidos.satTotalRegistros}`}
                  {diagnostics.emitidos.satTotalPagina != null && diagnostics.emitidos.satTotalPagina > 0
                    ? ` · totalPagina SAT ${diagnostics.emitidos.satTotalPagina}`
                    : ""}
                  {diagnostics.emitidos.codigo != null && ` · código ${diagnostics.emitidos.codigo}`}
                  {diagnostics.emitidos.mensaje && ` · ${diagnostics.emitidos.mensaje}`}
                </li>
                <li>
                  Recibidos / compras (R): crudos {diagnostics.recibidos.rawListLength} → importables{" "}
                  {diagnostics.recibidos.normalizedCount}
                  {diagnostics.recibidos.satTotalRegistros != null &&
                    ` · total SAT ${diagnostics.recibidos.satTotalRegistros}`}
                  {diagnostics.recibidos.satTotalPagina != null && diagnostics.recibidos.satTotalPagina > 0
                    ? ` · totalPagina SAT ${diagnostics.recibidos.satTotalPagina}`
                    : ""}
                  {diagnostics.recibidos.codigo != null && ` · código ${diagnostics.recibidos.codigo}`}
                  {diagnostics.recibidos.mensaje && ` · ${diagnostics.recibidos.mensaje}`}
                </li>
              </ul>
              {diagnostics.responseHints && (
                <div className="rounded border border-gray-200 bg-white/80 p-2 text-[10px] text-gray-600 space-y-1">
                  <p className="font-medium text-gray-800">Forma del JSON (emitidos)</p>
                  <p>
                    raíz: [{diagnostics.responseHints.emitidos.rootKeys.join(", ")}] · detalle:{" "}
                    {diagnostics.responseHints.emitidos.detalleKind}
                    {diagnostics.responseHints.emitidos.detalleKeys?.length
                      ? ` · claves detalle: [${diagnostics.responseHints.emitidos.detalleKeys.slice(0, 12).join(", ")}${
                          diagnostics.responseHints.emitidos.detalleKeys.length > 12 ? "…" : ""
                        }]`
                      : ""}{" "}
                    · mayor array visto: {diagnostics.responseHints.emitidos.maxArrayLengthSeen} ítems
                    {diagnostics.responseHints.emitidos.detalleDataKind != null &&
                      ` · detalle.data: ${diagnostics.responseHints.emitidos.detalleDataKind}${
                        diagnostics.responseHints.emitidos.detalleDataEntryCount != null
                          ? ` (${diagnostics.responseHints.emitidos.detalleDataEntryCount})`
                          : ""
                      }`}
                  </p>
                  <p className="font-medium text-gray-800">Forma del JSON (recibidos)</p>
                  <p>
                    raíz: [{diagnostics.responseHints.recibidos.rootKeys.join(", ")}] · detalle:{" "}
                    {diagnostics.responseHints.recibidos.detalleKind}
                    {diagnostics.responseHints.recibidos.detalleKeys?.length
                      ? ` · claves detalle: [${diagnostics.responseHints.recibidos.detalleKeys.slice(0, 12).join(", ")}${
                          diagnostics.responseHints.recibidos.detalleKeys.length > 12 ? "…" : ""
                        }]`
                      : ""}{" "}
                    · mayor array visto: {diagnostics.responseHints.recibidos.maxArrayLengthSeen} ítems
                    {diagnostics.responseHints.recibidos.detalleDataKind != null &&
                      ` · detalle.data: ${diagnostics.responseHints.recibidos.detalleDataKind}${
                        diagnostics.responseHints.recibidos.detalleDataEntryCount != null
                          ? ` (${diagnostics.responseHints.recibidos.detalleDataEntryCount})`
                          : ""
                      }`}
                  </p>
                </div>
              )}
              <div className="rounded-md border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-gray-800">
                <p className="font-medium text-indigo-950">Si en el portal FEL ves compras (recibidas) y aquí no</p>
                <ol className="mt-1.5 list-decimal list-inside space-y-1 text-[11px] text-gray-700">
                  <li>
                    Confirma que en <strong>Mi perfil</strong> tienes el <strong>NIT del receptor</strong> de esas
                    compras: con NIT guardado, la app ya envía <span className="font-mono">nitIdReceptor</span> en la
                    operación R. Si aun así no ves filas, prueba el mismo rango en el portal FEL.
                  </li>
                  <li>
                    Si necesitas comportamiento idéntico a moore-rpa (sin <span className="font-mono">nitIdReceptor</span>
                    ), define <code className="rounded bg-white/80 px-1 text-[10px]">SAT_FEL_OMIT_NIT_RECEPTOR=1</code>{" "}
                    en el servidor y redespliega.
                  </li>
                  <li>
                    Usa el <strong>mismo usuario</strong> con el que entras al portal y el <strong>mismo rango de fechas</strong>{" "}
                    que en «Consultar DTE» del SAT.
                  </li>
                  <li>
                    Comprueba que el NIT del perfil sea el <strong>receptor</strong> de esas facturas (CUI/NIT extranjero
                    u otro identificador en el XML puede no coincidir con el NIT que consultas).
                  </li>
                  <li>
                    Asegúrate de que «Hasta» no sea <strong>posterior a hoy</strong> (UTC del servidor); si lo es, el SAT
                    suele devolver total 0.
                  </li>
                </ol>
              </div>
              <p className="text-gray-500">
                Si «crudos» es mayor que «importables», el JSON del SAT cambió de forma; si ambos son 0, no hay datos en
                ese rango o el <span className="font-mono">usuario=</span> de la consulta no corresponde al contribuyente
                esperado (comprueba en el portal FEL con el mismo usuario).
              </p>
            </div>
          )}
          {rows.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full min-w-[56rem] text-left text-sm">
                <thead className="border-b border-gray-100 bg-gray-50 text-xs font-medium text-gray-500">
                  <tr>
                    <th className="px-3 py-2 w-10">
                      <input
                        type="checkbox"
                        aria-label="Seleccionar todas"
                        checked={
                          selectableRows.length > 0 && selected.size === selectableRows.length
                        }
                        onChange={(e) => {
                          if (e.target.checked) setSelected(new Set(selectableRows.map(rowKey)))
                          else setSelected(new Set())
                        }}
                      />
                    </th>
                    <th className="px-3 py-2">Fecha</th>
                    <th className="px-3 py-2">Documento / contraparte</th>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2 text-right">Monto</th>
                    <th className="px-3 py-2">Renglón</th>
                    <th className="px-3 py-2">Tipo transacción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.map((r) => {
                    const k = rowKey(r)
                    const typeOpts = r.flow === "expense" ? expenseTypeOptions : incomeTypeOptions
                    return (
                      <tr key={k} className={cn("hover:bg-gray-50/80", r.anulado && "opacity-60")}>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            disabled={r.anulado}
                            title={r.anulado ? "DTE anulado" : undefined}
                            checked={selected.has(k)}
                            onChange={(e) => {
                              setSelected((prev) => {
                                const n = new Set(prev)
                                if (e.target.checked) n.add(k)
                                else n.delete(k)
                                return n
                              })
                            }}
                          />
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-600">{r.date || "—"}</td>
                        <td className="px-3 py-2 min-w-[12rem]">
                          <p className="font-medium text-gray-900">{r.name}</p>
                          <p className="text-xs text-gray-500">{r.partnerName || "—"}</p>
                          {r.lineSummary && (
                            <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-2">{r.lineSummary}</p>
                          )}
                          {r.anulado && (
                            <span className="mt-1 inline-block rounded bg-gray-200 px-1.5 py-0.5 text-[10px] text-gray-700">
                              Anulado
                            </span>
                          )}
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
                            id={`sat-import-${k}-cat`}
                            options={categoryOptions}
                            value={rowCategory[k] || ""}
                            onChange={(e) => setRowCategory((prev) => ({ ...prev, [k]: e.target.value }))}
                            className="text-xs bg-white"
                          />
                        </td>
                        <td className="px-3 py-2 min-w-[10rem]">
                          <Select
                            id={`sat-import-${k}-tx`}
                            options={typeOpts}
                            value={rowTxType[k] || ""}
                            onChange={(e) => setRowTxType((prev) => ({ ...prev, [k]: e.target.value }))}
                            className="text-xs bg-white"
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
    </div>
  )
}
