"use client"

import { useState } from "react"
import { FileSpreadsheet, FileText, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"

export function BudgetExportActions({ projectId }: { projectId: string }) {
  const { toast } = useToast()
  const [busy, setBusy] = useState<null | "xlsx">(null)

  const printHref = `/print/projects/${projectId}/budget-statement`

  const downloadXlsx = async () => {
    setBusy("xlsx")
    try {
      const res = await fetch(`/api/projects/${projectId}/export/budget-workbook`, { credentials: "include" })
      if (!res.ok) {
        toast("error", await res.text())
        return
      }
      const blob = await res.blob()
      const cd = res.headers.get("Content-Disposition")
      const match = cd?.match(/filename="([^"]+)"/)
      const name = match?.[1] || `estado-presupuesto-${projectId.slice(0, 8)}.xlsx`
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = name
      a.click()
      URL.revokeObjectURL(url)
      toast("success", "Descarga lista")
    } catch {
      toast("error", "No se pudo descargar el Excel")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <a
        href={printHref}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:w-auto"
      >
        <Printer className="h-4 w-4" />
        Imprimir / PDF
      </a>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full sm:w-auto"
        loading={busy === "xlsx"}
        onClick={downloadXlsx}
      >
        <FileSpreadsheet className="h-4 w-4" />
        Excel (resumen + renglones)
      </Button>
      <a
        href={`/api/projects/${projectId}/export/transactions`}
        className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 sm:w-auto"
      >
        <FileText className="h-4 w-4" />
        CSV transacciones
      </a>
    </div>
  )
}
