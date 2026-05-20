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
import {
  defaultSatDateRangeIso,
  isoToDdMmYyyyDisplay,
  parseDdMmYyyyToIso,
  parseIsoDateYmd,
} from "@/lib/sat-gt/dates"
import { Download, FileSpreadsheet } from "lucide-react"

type Opt = { value: string; label: string }

/** Eco legible (es-GT) a partir de YYYY-MM-DD para evitar confusión con día/mes en el picker. */
function formatIsoDateEsGT(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const d = Number(m[3])
  if (!Number.isFinite(y) || mo < 0 || mo > 11 || d < 1 || d > 31) return null
  const local = new Date(y, mo, d)
  try {
    return new Intl.DateTimeFormat("es-GT", { day: "numeric", month: "long", year: "numeric" }).format(local)
  } catch {
    return null
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
  const range0 = useMemo(() => defaultSatDateRangeIso(), [])
  /** Hoy en UTC por comparación de cadenas YYYY-MM-DD; se recalcula en cada render (evita quedar «congelado» tras medianoche). */
  const utcTodayIso = new Date().toISOString().slice(0, 10)
  const [dateFrom, setDateFrom] = useState(range0.from)
  const [dateTo, setDateTo] = useState(range0.to)
  const [fromDisplay, setFromDisplay] = useState(() => isoToDdMmYyyyDisplay(range0.from))
  const [toDisplay, setToDisplay] = useState(() => isoToDdMmYyyyDisplay(range0.to))
  const [fromDateError, setFromDateError] = useState<string | undefined>()
  const [toDateError, setToDateError] = useState<string | undefined>()

  const commitFromDisplay = (raw: string) => {
    setFromDisplay(raw)
    const t = raw.trim()
    if (!t) {
      setFromDateError(undefined)
      return
    }
    const iso = parseDdMmYyyyToIso(t)
    if (!iso) {
      setFromDateError("Usa día/mes/año: dd/mm/aaaa (ej. 02/04/2026 = 2 de abril)")
      return
    }
    setFromDateError(undefined)
    setDateFrom(iso)
  }

  const commitToDisplay = (raw: string) => {
    setToDisplay(raw)
    const t = raw.trim()
    if (!t) {
      setToDateError(undefined)
      return
    }
    const iso = parseDdMmYyyyToIso(t)
    if (!iso) {
      setToDateError("Usa día/mes/año: dd/mm/aaaa (ej. 19/05/2026 = 19 de mayo)")
      return
    }
    setToDateError(undefined)
    setDateTo(iso)
  }
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

  const filtersReady =
    dateFrom.trim() !== "" &&
    dateTo.trim() !== "" &&
    parseIsoDateYmd(dateFrom) != null &&
    parseIsoDateYmd(dateTo) != null &&
    !fromDateError &&
    !toDateError
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
        const hastaFutura = dateTo.trim() > utcTodayIso
        toast(
          "error",
          hastaFutura
            ? `No hay facturas en la respuesta. «Hasta» (${dateTo.trim()}) es posterior a hoy UTC (${utcTodayIso}); el SAT suele devolver total 0. Pon la fecha final en hoy o en el último día con documentos.`
            : "No hay facturas listadas para importar. Revisa el diagnóstico abajo (usuario= en la API, rango de fechas y mensaje del SAT)."
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

  const rangoLegibleGt =
    filtersReady && dateFrom && dateTo
      ? (() => {
          const a = formatIsoDateEsGT(dateFrom)
          const b = formatIsoDateEsGT(dateTo)
          return a && b ? `${a} → ${b}` : null
        })()
      : null

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
            <Input
              label="Desde (día/mes/año)"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="dd/mm/aaaa"
              value={fromDisplay}
              onChange={(e) => commitFromDisplay(e.target.value)}
              onBlur={(e) => commitFromDisplay(e.target.value)}
              error={fromDateError}
              helperText={dateFrom && !fromDateError ? `Enviado al SAT como ${dateFrom}` : "Ej. 02/04/2026 = 2 de abril"}
            />
            <Input
              label="Hasta (día/mes/año)"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="dd/mm/aaaa"
              value={toDisplay}
              onChange={(e) => commitToDisplay(e.target.value)}
              onBlur={(e) => commitToDisplay(e.target.value)}
              error={toDateError}
              helperText={dateTo && !toDateError ? `Enviado al SAT como ${dateTo}` : "Ej. 19/05/2026 = 19 de mayo"}
            />
          </div>
          <p className="text-xs text-gray-600">
            Orden <strong>día / mes / año</strong> (Guatemala), no mes/día como en EE.UU. Conversión interna{" "}
            <strong>YYYY-MM-DD</strong>: <span className="font-mono text-[11px]">{dateFrom || "—"}</span> →{" "}
            <span className="font-mono text-[11px]">{dateTo || "—"}</span>.
          </p>
          {rangoLegibleGt && (
            <p className="text-xs text-gray-700 rounded-md border border-gray-200 bg-gray-50/90 px-3 py-2">
              Calendario: <span className="font-medium text-gray-900">{rangoLegibleGt}</span>. Si buscabas 4 de febrero,
              escribe <span className="font-mono">04/02/2026</span> (día 4, mes 2), no confundir con abril.
            </p>
          )}
          {dateToAfterUtcToday && (
            <p className="text-xs text-amber-950 bg-amber-100/90 rounded-lg px-3 py-2 border border-amber-200">
              «Hasta» es posterior a hoy en UTC (<span className="font-mono">{utcTodayIso}</span>). En el servidor la
              consulta al SAT se <strong>acota automáticamente</strong> a ese día como fecha final (salvo{" "}
              <code className="text-[11px]">SAT_FEL_DISABLE_DATE_CLAMP=1</code> en despliegue). Si ves total 0, revisa
              también el rango efectivo en el diagnóstico tras extraer.
            </p>
          )}
          <p className="text-xs text-amber-800 bg-amber-50/80 rounded-lg px-3 py-2 border border-amber-100">
            En Vercel/AWS Lambda se usa Chromium empaquetado (@sparticuz/chromium). En tu PC:{" "}
            <code className="text-[11px]">npx puppeteer browsers install chrome</code> si falla el navegador. Opcional:{" "}
            <code className="text-[11px]">SAT_PUPPETEER_HEADLESS=false</code>,{" "}
            <code className="text-[11px]">SAT_PACKAGED_CHROMIUM=1</code>. Si la primera consulta devuelve total 0, el
            servidor reintenta automáticamente (otro formato de fecha, establecimiento=0, etc.; desactivar con{" "}
            <code className="text-[11px]">SAT_FEL_DISABLE_AUTO_RETRY=1</code>). La consulta DTE usa el mismo{" "}
            <span className="font-mono">usuario=</span> que el login del
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
              {diagnostics.felConsultaUsuariosProbados && diagnostics.felConsultaUsuariosProbados.length > 1 ? (
                <p className="text-[10px] text-gray-600">
                  Candidatos <span className="font-mono">usuario=</span> probados:{" "}
                  <span className="font-mono">{diagnostics.felConsultaUsuariosProbados.join(" · ")}</span>
                </p>
              ) : null}
              {diagnostics.portalSniffHits && diagnostics.portalSniffHits.length > 0 ? (
                <p className="text-[10px] text-gray-600">
                  Peticiones vistas en el navegador (felcons):{" "}
                  <span className="font-mono">
                    {diagnostics.portalSniffHits
                      .slice(0, 8)
                      .map((h) => `${h.operationType}:${h.rowCount}/${h.totalReported}`)
                      .join(" · ")}
                  </span>
                </p>
              ) : null}
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
                {diagnostics.consultaTransport ? (
                  <>
                    {" "}
                    · consulta vía <span className="font-mono">{diagnostics.consultaTransport}</span>
                  </>
                ) : null}
              </p>
              {diagnostics.intentosConsulta && diagnostics.intentosConsulta.length > 0 ? (
                <p className="text-xs text-indigo-900 bg-indigo-50/90 rounded-md border border-indigo-100 px-2 py-1.5">
                  Intentos automáticos: <span className="font-mono">{diagnostics.intentosConsulta.join(", ")}</span>
                </p>
              ) : null}
              {diagnostics.recibidasQueryMode ? (
                <p className="text-xs text-emerald-900 bg-emerald-50/90 rounded-md border border-emerald-100 px-2 py-1.5">
                  Compras (R) con datos vía modo:{" "}
                  <span className="font-mono">{diagnostics.recibidasQueryMode}</span>
                  {diagnostics.recibidasWidenFrom ? (
                    <> · rango ampliado desde <span className="font-mono">{diagnostics.recibidasWidenFrom}</span></>
                  ) : null}
                </p>
              ) : diagnostics.recibidasLastAttemptMode ? (
                <p className="text-xs text-gray-700 bg-gray-50 rounded-md border border-gray-200 px-2 py-1.5">
                  Última variante R probada (0 filas):{" "}
                  <span className="font-mono">{diagnostics.recibidasLastAttemptMode}</span>
                  {" · "}
                  consulta vía axios (como moore-rpa) salvo{" "}
                  <span className="font-mono">SAT_FEL_PREFER_BROWSER=1</span>
                </p>
              ) : null}
              {diagnostics.recibidasAttempts && diagnostics.recibidasAttempts.length > 0 ? (
                <p className="text-[10px] text-gray-600">
                  Variantes R probadas (filas):{" "}
                  <span className="font-mono">
                    {diagnostics.recibidasAttempts
                      .map((a) => `${a.mode}=${a.rowCount}${a.codigo ? `/${a.codigo}` : ""}`)
                      .join(" · ")}
                  </span>
                </p>
              ) : null}
              <p className="text-gray-600">
                En compras (<span className="font-mono">R</span>), <span className="font-mono">nitIdReceptor</span> se
                rellena con el NIT del perfil <strong>solo si es distinto</strong> del valor de{" "}
                <span className="font-mono">usuario=</span> (p. ej. login con correo y NIT en perfil). Si entras con el{" "}
                <strong>mismo NIT</strong> que guardaste, se deja vacío como moore-rpa (duplicar el mismo NIT en ambos
                parámetros a veces devuelve lista vacía en el SAT).{" "}
                <span className="font-mono">SAT_FEL_OMIT_NIT_RECEPTOR=1</span>: siempre vacío.{" "}
                <span className="font-mono">SAT_FEL_FORCE_NIT_RECEPTOR=1</span>: enviar NIT aunque coincida con el login. Sin
                NIT en perfil y <span className="font-mono">SAT_FEL_NIT_RECEPTOR_QUERY=1</span>: se usa el texto de{" "}
                <span className="font-mono">usuario=</span> en <span className="font-mono">nitIdReceptor</span>.
              </p>
              {diagnostics.queryWindow && (
                <div
                  className={
                    diagnostics.queryWindow.dateToAfterUtcToday && !diagnostics.queryWindow.datesClamped
                      ? "rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-950 text-xs space-y-1"
                      : "text-gray-600 text-xs space-y-1"
                  }
                >
                  <p>
                    Ventana <strong>solicitada</strong>:{" "}
                    <span className="font-mono">{diagnostics.queryWindow.dateFrom}</span> →{" "}
                    <span className="font-mono">{diagnostics.queryWindow.dateTo}</span>
                    {diagnostics.queryWindow.dateToAfterUtcToday && !diagnostics.queryWindow.datesClamped ? (
                      <>
                        {" "}
                        — «hasta» posterior a hoy UTC ({diagnostics.queryWindow.utcToday}). Con{" "}
                        <span className="font-mono">SAT_FEL_DISABLE_DATE_CLAMP=1</span> el servidor no acota la fecha y
                        el SAT suele devolver total 0.
                      </>
                    ) : null}
                  </p>
                  {(diagnostics.queryWindow.effectiveDateFrom != null &&
                    diagnostics.queryWindow.effectiveDateTo != null &&
                    (diagnostics.queryWindow.datesClamped ||
                      diagnostics.queryWindow.effectiveDateFrom !== diagnostics.queryWindow.dateFrom ||
                      diagnostics.queryWindow.effectiveDateTo !== diagnostics.queryWindow.dateTo)) && (
                    <p className="text-gray-800">
                      Rango <strong>efectivo</strong> en la API del SAT:{" "}
                      <span className="font-mono">
                        {diagnostics.queryWindow.effectiveDateFrom ?? diagnostics.queryWindow.dateFrom}
                      </span>{" "}
                      →{" "}
                      <span className="font-mono">
                        {diagnostics.queryWindow.effectiveDateTo ?? diagnostics.queryWindow.dateTo}
                      </span>
                      {diagnostics.queryWindow.datesClamped ? (
                        <> (acotado a hoy UTC o ajustado si «desde» quedaba después de «hasta»).</>
                      ) : null}
                    </p>
                  )}
                </div>
              )}
              {diagnostics.felQueryEcho &&
                (diagnostics.felQueryEcho.fechaEmisionIni ||
                  diagnostics.felQueryEcho.fechaEmisionFinal ||
                  diagnostics.felQueryEcho.fechaRecepcionIni) && (
                  <p className="text-gray-600">
                    Fechas en la URL del SAT (última consulta R efectiva):{" "}
                    {diagnostics.felQueryEcho.fechaRecepcionIni ? (
                      <>
                        <span className="font-mono">fechaRecepcionIni=</span>
                        <span className="font-mono text-[11px]">
                          {diagnostics.felQueryEcho.fechaRecepcionIni}
                        </span>
                        {" · "}
                        <span className="font-mono">fechaRecepcionFinal=</span>
                        <span className="font-mono text-[11px]">
                          {diagnostics.felQueryEcho.fechaRecepcionFinal ?? "—"}
                        </span>
                        {(diagnostics.felQueryEcho.fechaEmisionIni ||
                          diagnostics.felQueryEcho.fechaEmisionFinal) && (
                          <>
                            {" "}
                            · emisión:{" "}
                            <span className="font-mono text-[11px]">
                              {diagnostics.felQueryEcho.fechaEmisionIni || "—"} →{" "}
                              {diagnostics.felQueryEcho.fechaEmisionFinal || "—"}
                            </span>
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="font-mono">fechaEmisionIni=</span>
                        <span className="font-mono text-[11px]">
                          {diagnostics.felQueryEcho.fechaEmisionIni ?? "—"}
                        </span>
                        {" · "}
                        <span className="font-mono">fechaEmisionFinal=</span>
                        <span className="font-mono text-[11px]">
                          {diagnostics.felQueryEcho.fechaEmisionFinal ?? "—"}
                        </span>
                      </>
                    )}
                  </p>
                )}
              {diagnostics.felQueryEcho && (
                <p className="text-gray-600">
                  Parámetros consulta-dte (eco): <span className="font-mono">establecimiento=</span>{" "}
                  <span className="font-mono">{diagnostics.felQueryEcho.establecimientoConsulta}</span>
                  {" · "}
                  <span className="font-mono">R</span> / <span className="font-mono">nitIdReceptor</span>{" "}
                  {diagnostics.felQueryEcho.nitIdReceptorRecibidos.sent ? "enviado" : "omitido"} (
                  <span className="font-mono">{diagnostics.felQueryEcho.nitIdReceptorRecibidos.reasonKey}</span>)
                  {diagnostics.felQueryEcho.recibidosNitIdReceptorForzado ? (
                    <>
                      {" "}
                      · en <span className="font-mono">zip-xml</span> / listado R se usó{" "}
                      <span className="font-mono">nitIdReceptor</span> forzado (reintento con NIT = login).
                    </>
                  ) : null}
                </p>
              )}
              {diagnostics.felQueryEcho?.reintentosConsulta && diagnostics.felQueryEcho.reintentosConsulta.length > 0 ? (
                <p className="text-xs text-indigo-900 bg-indigo-50/90 rounded-md border border-indigo-100 px-2 py-1.5">
                  Reintentos automáticos que devolvieron datos:{" "}
                  <span className="font-mono">{diagnostics.felQueryEcho.reintentosConsulta.join(", ")}</span>
                  <span className="text-indigo-800/90">
                    {" "}
                    (establecimiento=0, fechas dd/MM/yyyy en URL, nitIdReceptor duplicado en R, según el caso).
                  </span>
                </p>
              ) : null}
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
                    Para <strong>compras</strong>, el servidor prueba primero{" "}
                    <span className="font-mono">fechaRecepcionIni/Final</span> (como la pestaña Recibidas del portal), luego
                    emisión y otras variantes de <span className="font-mono">nitIdReceptor</span>. Mira en el diagnóstico
                    «Variantes R probadas» y el modo ganador.
                  </li>
                  <li>
                    Si entras al SAT con el <strong>mismo NIT</strong> que tienes en perfil, muchas variantes dejan{" "}
                    <span className="font-mono">nitIdReceptor</span> vacío; otras lo envían aunque coincida (reintento). Si
                    tu login es <strong>correo</strong> y el NIT del receptor está en perfil, también se prueba con NIT en la
                    URL.
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
                    En el servidor la consulta <strong>acota</strong> «hasta» al día UTC de hoy si es futura (salvo{" "}
                    <code className="rounded bg-white/80 px-1 text-[10px]">SAT_FEL_DISABLE_DATE_CLAMP=1</code>). Mira en
                    el diagnóstico el rango <strong>efectivo</strong> enviado al SAT.
                  </li>
                  <li>
                    Si la primera respuesta es total 0 pero en FEL ves documentos, prueba en el despliegue (p. ej. Vercel){" "}
                    <code className="rounded bg-white/80 px-1 text-[10px]">SAT_FEL_EMPTY_RETRY_ESTABLECIMIENTO_ZERO=1</code>{" "}
                    (segunda pasada con <span className="font-mono">establecimiento=0</span>) y/o{" "}
                    <code className="rounded bg-white/80 px-1 text-[10px]">SAT_FEL_EMPTY_RETRY_R_DUPLICATE_NIT=1</code>{" "}
                    (segunda consulta R con <span className="font-mono">nitIdReceptor</span> = login aunque sea el mismo
                    NIT).
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
